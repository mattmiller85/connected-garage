#[macro_use]
extern crate rouille;
extern crate fstrings;

#[macro_use]
extern crate serde_json;

extern crate serde;
extern crate tokio;

use serde::Deserialize;

use rppal::gpio::Gpio;
use std::collections::HashMap;
use std::io;
use std::path::Path;
use std::thread;
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
const MIDDLE_TRIGGER_PIN: u8 = 26;
const MIDDLE_ECHO_PIN: u8 = 19;
const RIGHT_TRIGGER_PIN: u8 = 5;
const RIGHT_ECHO_PIN: u8 = 6;

#[derive(Deserialize)]
#[derive(Clone)]
struct DoorReq {
  which_door: String
}

#[derive(Deserialize)]
struct PinMetaData {
  door_pin: u8,
  status_trigger_pin: u8,
  status_echo_pin: u8,
  open_threshhold_cm: f32
}

fn get_pin_metadata() -> HashMap<String, PinMetaData>{
  let mut pin_meta_data: HashMap<String, PinMetaData> = HashMap::new();

  pin_meta_data.insert("left".to_string(), PinMetaData {
    door_pin: LEFT_DOOR_PIN,
    status_echo_pin: LEFT_ECHO_PIN,
    status_trigger_pin: LEFT_TRIGGER_PIN,
    open_threshhold_cm: 12.0
  });
  pin_meta_data.insert("middle".to_string(), PinMetaData {
    door_pin: MIDDLE_DOOR_PIN,
    status_echo_pin: MIDDLE_ECHO_PIN,
    status_trigger_pin: MIDDLE_TRIGGER_PIN,
    open_threshhold_cm: 11.5
  });
  pin_meta_data.insert("right".to_string(), PinMetaData {
    door_pin: RIGHT_DOOR_PIN,
    status_echo_pin: RIGHT_ECHO_PIN,
    status_trigger_pin: RIGHT_TRIGGER_PIN,
    open_threshhold_cm: 8.0
  });
  pin_meta_data
}



#[tokio::main]
async fn main() {
  // let building_id = "5447bb99-4bef-4a27-86e3-f2cd6b0b98b0";

  let app_settings = &get_app_settings();
  let client = Box::from(SqsClient::new_with(HttpClient::new().unwrap(), get_aws_profile(), Region::UsEast2));

  // Print out our settings (as a HashMap)
  println!("settings - {:?}", app_settings);

  thread::spawn( || {
    start_api();
  });
  
  let q_url = app_settings.get("consume_queue_url").unwrap();
  let q_produce_url = app_settings.get("produce_queue_url").unwrap().clone();
  let q_produce_url_string = q_produce_url.to_string();
  println!("Listening for messages on {}", q_url);
  let cloned_client = client.clone();
  tokio::spawn(async move { 
    loop {
      send_door_state(cloned_client.clone(),q_produce_url_string.to_string(), DoorReq { which_door: "none".to_string() }).await;
      tokio::time::delay_for(tokio::time::Duration::from_secs(240)).await;
    }
  });

  loop {
    println!("Looking for messages on {}", q_url);
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
              Some("toggle") => {
                open_door(payload);
                std::thread::sleep(Duration::from_secs(15));
                send_door_state(client.clone(), q_produce_url.to_string(), DoorReq { which_door: "none".to_string() }).await;
              },
              Some("open") => try_open(payload),
              Some("close") => try_close(payload),
              Some("status") => {

                  let q_produce_url = app_settings.get("produce_queue_url").unwrap();
                  send_door_state(client.clone(), q_produce_url.to_string(), payload).await;
                },
                _ => println!("Wat?")
              }
              match client.clone().delete_message(DeleteMessageRequest {
                queue_url: q_url.to_string(),
                receipt_handle: m.receipt_handle.as_ref().unwrap().to_string()
              }).await {
                Ok(_r) => println!("Completed message"),
                Err(e) => println!("Error completing message {}", e)
              }

          }
        },
        None => println!("No messages pending")
      },
      Err(e) => println!("Error checking for messages {}", e)
    }
    std::thread::sleep(Duration::from_secs(1));
  }
}

async fn send_door_state(client: Box<SqsClient>, queue_url: String, _payload: DoorReq) {
  match client.send_message(SendMessageRequest {
    queue_url,
    message_body: String::from(&json!({ 
      "message_type": "door_status",
      "building_id":  "5447bb99-4bef-4a27-86e3-f2cd6b0b98b0",
      "payload": {
        "left": {
          "is_open": try_get_status(DoorReq { which_door: "left".to_string() })
        },
        "middle": {
          "is_open": try_get_status(DoorReq { which_door: "middle".to_string() })
        },
        "right": {
          "is_open": try_get_status(DoorReq { which_door: "right".to_string() })
        }
      }
    }).to_string()),
    delay_seconds: None,
    message_attributes: None,
    message_deduplication_id: None,
    message_group_id: None,
    message_system_attributes: None
  }).await {
    Ok(_r) => println!("Sent door state."),
    Err(e) => println!("Error sending door state {}", e)
  }
}

fn get_aws_profile() -> rusoto_core::credential::ProfileProvider {
  let app_settings = get_app_settings();
  let credentials = app_settings.get("aws_credentials_path").unwrap();
  let profile = app_settings.get("aws_profile_name").unwrap();
  rusoto_core::credential::ProfileProvider::with_configuration(credentials, profile)
}

fn start_api() {
  let app_settings = get_app_settings();
  let default_address = &"0.0.0.0:80".to_string();
  let listenon = app_settings.get("listenon").unwrap_or(default_address);

  println!(
    "Running connected garage controller on address {listenon}",
    listenon = listenon
  );

  rouille::start_server(listenon, move |request| {
    
    rouille::log(&request, io::stdout(), || {
      
      router!(request,
        (POST) (/toggle) => {
          let request_body: DoorReq = try_or_400!(rouille::input::json_input(request));
          open_door(request_body);
          rouille::Response::empty_204()
        },
        (GET) (/door/{which_door: String}/status) => {

          println!("{}" , which_door);
          let is_open = is_door_open(which_door);
          rouille::Response::json(&json!({
            "is_open": is_open
          }))
        },
        _ => rouille::Response::empty_404()
      )
    })
  });
}

fn get_app_settings() -> HashMap<String, String> {
  let mut settings = config::Config::default();

  let deployed_file = panic::catch_unwind(|| {
    config::File::from(Path::new("/home/pi/connected-garage/AppSettings.toml"))
  });

  match deployed_file {
    Ok(f) => { settings.merge(f).unwrap(); () },
    Err(_e) => println!("Error reading settings")
  }
 
  settings.try_into::<HashMap<String, String>>().unwrap()
}

fn try_open(request: DoorReq) {
  if is_door_open(request.clone().which_door) == false {
    open_door(request);
  }
}

fn try_close(request: DoorReq) {
  if is_door_open(request.clone().which_door) {
    open_door(request);
  }
}

fn open_door(request: DoorReq) {
  let pin_metadata = get_pin_metadata();
  let pins = pin_metadata.get(&request.which_door).unwrap();

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

fn try_get_status(request: DoorReq) -> bool {
  is_door_open(request.which_door)
}

fn is_door_open(which_door: String) -> bool {
 
  let pin_metadata = get_pin_metadata();

  let pins = pin_metadata.get(&which_door).unwrap();
  let trigger_pin_num = pins.status_trigger_pin;
  let echo_pin_num = pins.status_echo_pin;
  let open_threshhold_cm = pins.open_threshhold_cm;
  
  let mut trigger_pin = Gpio::new().unwrap().get(trigger_pin_num).unwrap().into_output();
  let echo_pin = Gpio::new().unwrap().get(echo_pin_num).unwrap().into_input();
  trigger_pin.set_low();
  thread::sleep(Duration::from_millis(250));
  // take the average of 5 distance readings

  let mut avg_distance = 0.0;

  let mut divisor = 1.0;
  for _x in 0..20 {
    trigger_pin.set_high();
    thread::sleep(Duration::from_micros(10));
    trigger_pin.set_low();
    let pulse_start = Instant::now();
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
    let distance = pulse_duration * 17150.0;
    
    if distance < 75.0 && distance > 2.0 {
      // throw out bad readings
      avg_distance += distance;
      divisor += 1.0;
    }
    println!("{}" , avg_distance);
    thread::sleep(Duration::from_millis(15));
  }
  
  let distance_cm = avg_distance / (divisor - 1.0);
  println!("cm away: {}" , distance_cm);

  distance_cm > open_threshhold_cm
}