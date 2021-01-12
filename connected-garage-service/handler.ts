import { APIGatewayEventRequestContext, APIGatewayProxyEvent, SQSEvent } from 'aws-lambda';
import { DynamoDB, SQS, ApiGatewayManagementApi } from 'aws-sdk';

export async function getDoorState(event: APIGatewayProxyEvent,
  context: APIGatewayEventRequestContext) {

  const ddb = new DynamoDB.DocumentClient();
  const result = await ddb.get({
    TableName: process.env.CONFIG_DOORSTATE_TABLE,
    Key: {
      buildingId: event.pathParameters.buildingId
    }
  }).promise();

  const response = {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(result.Item),
  };

  return response;
}

export async function sendDoorMessage(event: APIGatewayProxyEvent,
  context: APIGatewayEventRequestContext) {

  const requestBody = JSON.parse(event.body);

  const sqs = new SQS();

  const qResponse = await sqs.sendMessage({
    MessageBody: JSON.stringify(
      {
        building_id: process.env.CONFIG_MY_BUILDING,
        message_type: requestBody.message_type,
        body: requestBody
      }
    ),
    QueueUrl: process.env.CONFIG_SQS_ENDPOINT
  }).promise();

  // tslint:disable-next-line:no-console
  console.log(`Successfully Added To Queue: ${JSON.stringify(qResponse, undefined, 1)}`);

  const ddb = new DynamoDB.DocumentClient();
  await ddb.put({
    TableName: process.env.CONFIG_DOORHISTORY_TABLE,
    Item: { buildingId: process.env.CONFIG_MY_BUILDING, doorPosition: requestBody.message_type, received: new Date().getTime(), ...requestBody },
  }).promise();

  const response = {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify({ messageId: qResponse.MessageId }),
  };

  return response;
}

async function sendMessageToSocketConnection(connection: string, message: any) {
  const socketEndpoint = new ApiGatewayManagementApi({
    endpoint: 'https://870olo7mrh.execute-api.us-east-2.amazonaws.com/dev'
  });

  // tslint:disable-next-line: no-console
  console.log(`Sending update to connection: ${connection}`);
  // tslint:disable-next-line: no-console
  console.log(`payload: ${JSON.stringify(message, null, 1)}`);
  try {
    await socketEndpoint.postToConnection(
      {
        ConnectionId: connection, // connectionId of the receiving ws-client
        Data: JSON.stringify(message),
      }).promise();
  } catch (e) {
    // swallow
  }
}

export async function handleDoorMessage(event: SQSEvent) {

  const ddb = new DynamoDB.DocumentClient();

  for (const message of event.Records) {
    const body = JSON.parse(message.body);
    switch (body.message_type) {
      case 'door_status':
        await ddb.put({
          TableName: process.env.CONFIG_DOORSTATE_TABLE,
          Item: { buildingId: body.building_id, ...body.payload },
        }).promise();
        const connections = await ddb.scan({ TableName: process.env.CONFIG_WEBSOCKET_CONNECTION_TABLE }).promise()
        await Promise.all(connections.Items.map((conn) => sendMessageToSocketConnection(conn.connectionId, body)));
        break;
      default:
        // tslint:disable-next-line:no-console
        console.log('Unknown message type.');
    }
  }

  const response = {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
  };

  return response;
}

export async function connectionHandler(event, context) {
  const { requestContext: { routeKey } } = event;
  const ddb = new DynamoDB.DocumentClient();
  switch (routeKey) {
    case '$connect':
      await ddb.put({
        TableName: process.env.CONFIG_WEBSOCKET_CONNECTION_TABLE,
        Item: {
          connectionId: event.requestContext.connectionId,
          // tslint:disable-next-line: radix
          ttl: parseInt(((Date.now() / 1000) + 3600).toFixed(0)) // how often to expire?
        }
      }).promise();
      break;

    case '$disconnect':
      await ddb.delete({
        TableName: process.env.CONFIG_WEBSOCKET_CONNECTION_TABLE,
        Key: { connectionId: event.requestContext.connectionId }
      }).promise();
      break;
    default:
      break;
  }
  return { statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    } };
}