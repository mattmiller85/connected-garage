import { APIGatewayProxyEvent, APIGatewayEventRequestContext } from 'aws-lambda';

export async function getDoorStatus(event: APIGatewayProxyEvent,
  context: APIGatewayEventRequestContext) {

  // async/await also works out of the box
  await new Promise((resolve, reject) => setTimeout(resolve, 500))

  const response = {
    statusCode: 200,
    body: JSON.stringify({
      is_open: false
    }),
  };
  
  return response;
}
