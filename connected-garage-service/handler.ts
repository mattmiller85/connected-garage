import { APIGatewayEventRequestContext, APIGatewayProxyEvent, SQSEvent } from 'aws-lambda';
import { DynamoDB, SQS } from 'aws-sdk';

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
    body: JSON.stringify({ messageId: qResponse.MessageId }),
  };

  return response;
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
      default:
        // tslint:disable-next-line:no-console
        console.log('Unknown message type.');
    }
  }

  const response = {
    statusCode: 200
  };

  return response;
}
