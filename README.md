# connected-garage

## connected-garage-controller

This project contains the [Rust](https://www.rust-lang.org) code that runs on the raspberry pi.  The functionality consists of a REST API and an SQS queue consumer to process messages.  The code operates on the GPIO pins of the raspberry pi to activate relays to open/close the door and interface with ultrasonic sensors to watch teh opened/closed status of the doors.

The code can by cross compiled to ARM for the raspberry pi by running:
```bash
./build.sh
```

## connected-garage-service

This project contains the Typescript code deployed to AWS Lambda via the [Serverless Framework](https://www.serverless.com/).  The functionality consists of REST api endpoints and a WebSocket to be used from the mobile app.  The endpoints are all secured and authenticated using AWS Cognito.

You can run this code locally using serverless offline by running:

```bash
serverless offline start
```

## connected-garage-ui

This project contains the React Native mobile app.  It may be started by running this:
```bash
# for IOS
npm run ios
```

```bash
# for Android
npm run android
```