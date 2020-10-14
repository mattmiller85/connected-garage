#[macro_use]
extern crate rouille;

#[macro_use]
extern crate fstrings;

#[macro_use]
extern crate serde_json;

#[macro_use]
extern crate serde;

#[macro_use]
extern crate tokio;

use serde::{Deserialize};

use rppal::gpio::Gpio;
use std::collections::HashMap;
use std::io;
use std::path::Path;
use std::thread;
use std::error::Error;
use std::time::{Duration, Instant};

use std::panic;


use rusoto_sqs::ReceiveMessageRequest;
use rusoto_sqs::SendMessageRequest;
use rusoto_sqs::DeleteMessageRequest;
use rusoto_sqs::SqsClient;
use rusoto_sqs::Sqs;
use rusoto_core::{ Region, HttpClient };

use serde_json::Value;

const LEFT_DOOR_PIN: u8 = 16;
const MIDDLE_DOOR_PIN: u8 = 20;
const RIGHT_DOOR_PIN: u8 = 21;
const LEFT_TRIGGER_PIN: u8 = 17;
const LEFT_ECHO_PIN: u8 = 27;
const MIDDLE_TRIGGER_PIN: u8 = 17;
const MIDDLE_ECHO_PIN: u8 = 27;
const RIGHT_TRIGGER_PIN: u8 = 17;
const RIGHT_ECHO_PIN: u8 = 27;

#[derive(Deserialize)]
#[derive(Clone)]
struct DoorReq {
  which_door: String
}

#[derive(Deserialize)]
struct PinMetaData {
  door_pin: u8,
  status_trigger_pin: u8,
  status_echo_pin: u8
}

fn get_pin_metadata() -> HashMap<String, PinMetaData>{
  let mut pin_meta_data: HashMap<String, PinMetaData> = HashMap::new();

  pin_meta_data.insert("left".to_string(), PinMetaData {
    door_pin: LEFT_DOOR_PIN,
    status_echo_pin: LEFT_ECHO_PIN,
    status_trigger_pin: LEFT_TRIGGER_PIN,
  });
  pin_meta_data.insert("middle".to_string(), PinMetaData {
    door_pin: MIDDLE_DOOR_PIN,
    status_echo_pin: MIDDLE_ECHO_PIN,
    status_trigger_pin: MIDDLE_TRIGGER_PIN,
  });
  pin_meta_data.insert("right".to_string(), PinMetaData {
    door_pin: RIGHT_DOOR_PIN,
    status_echo_pin: RIGHT_ECHO_PIN,
    status_trigger_pin: RIGHT_TRIGGER_PIN,
  });
  pin_meta_data
}
const httpClient: HttpClient = HttpClient::new().unwrap();
static app_settings: &'static HashMap<String, String> = &get_app_settings();
static client: &'static SqsClient = &SqsClient::new_with(httpClient, get_aws_profile(), Region::UsEast2);

#[tokio::main]
async fn main() {
  let building_id = "5447bb99-4bef-4a27-86e3-f2cd6b0b98b0";

  
  // Print out our settings (as a HashMap)
  println!("settings - {:?}", app_settings);
  let pin_metadata: &'static HashMap<String, PinMetaData> = &get_pin_metadata();

  thread::spawn( || {
    start_api();
  });
  
  
  
  let q_url = app_settings.get("consume_queue_url").unwrap();
  let q_produce_url = app_settings.get("produce_queue_url").unwrap();
  println!("Listening for messages on {}", q_url);
  println!("Sending messages to f{}", q_produce_url);

  thread::spawn( || {
    loop {
      send_door_state(q_produce_url.to_string().clone(), DoorReq { which_door: "none".to_string() }, &pin_metadata);
      std::thread::sleep(Duration::from_secs(60));
    }
  });

  loop {
    match client.receive_message(ReceiveMessageRequest {
      queue_url: q_url.to_string(),
      ..Default::default()
    }).await {
      Ok(result) => match result.messages {
        Some(messages) => {
          for m in messages.iter() {
            println!("Got a message {}", m.body.as_ref().unwrap());
            let jsonmessage: Value = serde_json::from_str(m.body.as_ref().unwrap()).unwrap();
            println!("Got json {}", jsonmessage);
            let payload: DoorReq = serde_json::from_value(jsonmessage["body"].get("payload").unwrap().clone()).unwrap();
            match jsonmessage["body"]["message_type"].as_str() {
              Some("toggle") => open_door(payload, &pin_metadata),
              Some("open") => try_open(payload, &pin_metadata),
              Some("close") => try_close(payload, &pin_metadata),
              Some("status") => {
                  send_door_state(q_produce_url.to_string(), payload, &pin_metadata);
                },
                _ => println!("Wat?")
              }
              client.delete_message(DeleteMessageRequest {
                queue_url: q_url.to_string(),
                receipt_handle: m.receipt_handle.as_ref().unwrap().to_string()
              }).await;

          }
        },
        None => println!("No messages pending")
      },
      Err(e) => println!("Error checking for messages {}", e)
    }
    println!("Checking for messages");
    std::thread::sleep(Duration::from_secs(1));
  }
  ()
}

fn send_door_state(queue_url: String, payload: DoorReq, pin_metadata: &HashMap<String, PinMetaData>) {
  client.send_message(SendMessageRequest {
    queue_url,
    message_body: String::from(&json!({ 
      "message_type": "door_status",
      "building_id":  "5447bb99-4bef-4a27-86e3-f2cd6b0b98b0",
      "payload": {
        "left": {
          "is_open": try_get_status(DoorReq { which_door: "left".to_string() }, &pin_metadata)
        },
        "middle": {
          "is_open": try_get_status(DoorReq { which_door: "middle".to_string() }, &pin_metadata)
        },
        "right": {
          "is_open": try_get_status(DoorReq { which_door: "right".to_string() }, &pin_metadata)
        }
      }
    }).to_string()),
    delay_seconds: None,
    message_attributes: None,
    message_deduplication_id: None,
    message_group_id: None,
    message_system_attributes: None
  });
}

fn get_aws_profile() -> rusoto_core::credential::ProfileProvider {
  //rusoto_core::credential::ProfileProvider::with_configuration("/home/pi/.aws/credentials", "cbus-campio-2020")
  let credentials = app_settings.get("aws_credentials_path").unwrap();
  let profile = app_settings.get("aws_profile_name").unwrap();
  rusoto_core::credential::ProfileProvider::with_configuration(credentials, profile)
}

fn start_api() {
  let pin_metadata = get_pin_metadata();
  let default_address = &"0.0.0.0:80".to_string();
  let listenon = app_settings.get("listenon").unwrap_or(default_address);

  rouille::start_server(listenon, move |request| {
    
    rouille::log(&request, io::stdout(), || {
      
      router!(request,
        (POST) (/toggle) => {
          let request_body: DoorReq = try_or_400!(rouille::input::json_input(request));
          open_door(request_body, &pin_metadata);
          rouille::Response::empty_204()
        },
        (GET) (/door/{which_door: String}/status) => {

          println!("{}" , which_door);
          let is_open = is_door_open(which_door, &pin_metadata);
          rouille::Response::json(&json!({
            "is_open": is_open
          }))
        },
        _ => rouille::Response::empty_404()
      )
    })
  });

  println!(
    "Running connected garage controller on address {listenon}",
    listenon = listenon
  )
}

const fn get_app_settings() -> HashMap<String, String> {
  let mut settings = config::Config::default();

  let localFile = panic::catch_unwind(|| config::File::with_name("AppSettings"));
  let deployedFile = panic::catch_unwind(|| {
    config::File::from(Path::new("/home/pi/connected-garage/AppSettings.toml"))
  });
  
  if deployedFile.is_ok() {
    settings.merge(deployedFile.unwrap());
  }

  if localFile.is_ok() {
    settings.merge(localFile.unwrap());
  }

  settings.try_into::<HashMap<String, String>>().unwrap()
}

fn try_open(request: DoorReq, pin_metadata: &HashMap<String, PinMetaData>) {

  if is_door_open(request.clone().which_door, pin_metadata) == false {
    open_door(request, pin_metadata);
  }
}

fn try_close(request: DoorReq, pin_metadata: &HashMap<String, PinMetaData>) {
  if is_door_open(request.clone().which_door, pin_metadata) {
    open_door(request, pin_metadata);
  }
}

fn open_door(request: DoorReq, pin_metadata: &HashMap<String, PinMetaData>) {
  let mut pins = pin_metadata.get(&request.which_door).unwrap();

  println!("Pressing {} door button using pin {}" , &request.which_door, pins.door_pin);
  let mut the_pin = Gpio::new()
    .unwrap()
    .get(pins.door_pin)
    .unwrap()
    .into_output();
  the_pin.set_reset_on_drop(true);
  the_pin.set_high();
  thread::sleep(Duration::from_millis(1000));
  the_pin.set_low();
}

fn try_get_status(request: DoorReq, pin_metadata: &HashMap<String, PinMetaData>) -> bool {
  is_door_open(request.which_door, pin_metadata)
}

fn is_door_open(which_door: String, pin_metadata: &HashMap<String, PinMetaData>) -> bool {
 
  
  let mut pins = pin_metadata.get(&which_door).unwrap();
  let mut trigger_pin_num = pins.status_trigger_pin;
  let mut echo_pin_num = pins.status_echo_pin;
  
  let mut trigger_pin = Gpio::new().unwrap().get(trigger_pin_num).unwrap().into_output();
  let echo_pin = Gpio::new().unwrap().get(echo_pin_num).unwrap().into_input();
  trigger_pin.set_low();
  thread::sleep(Duration::from_millis(250));
  // take the average of 5 distance readings
  let mut distance_cm = 500.0;
  let mut is_open = true;

  let mut avg_distance = 0.0;

  for _x in 0..20 {
    trigger_pin.set_high();
    thread::sleep(Duration::from_micros(10));
    trigger_pin.set_low();
    let mut pulse_start = Instant::now();
    let mut pulse_duration = 0.0;
    let timeoutseconds: f32 = 5.0;
    while echo_pin.is_low() {
      pulse_duration = pulse_start.elapsed().as_secs_f32();
      if pulse_duration > timeoutseconds {
        break;
      }
    }
    while echo_pin.is_high() {
      pulse_duration = pulse_start.elapsed().as_secs_f32();
    }
    // Speed of sound! 343 m/s (767 mph in freedom units)
    // 34300 cm/s
    // 17150 = one way
    avg_distance += pulse_duration * 17150.0; 
    println!("{}" , avg_distance);
    thread::sleep(Duration::from_millis(10));
  }
  
  distance_cm = avg_distance / 20.0;
  println!("cm away: {}" , distance_cm);

  distance_cm > 12.0
}