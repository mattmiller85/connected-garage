import Amplify, { API, Auth } from "aws-amplify";
import React, { ReactNode } from "react";

import { format } from 'date-fns'

import { config as getconfig } from './config';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDoorOpen, faDoorClosed } from '@fortawesome/free-solid-svg-icons';

const config = getconfig();

const socketUrl = config.socketUrl;

class Openers extends React.Component<{}, { doorState: any, buttonState: any, consoleMessage: string, username: string }> {
  private ws: WebSocket | undefined;

  constructor(props: any) {
    super(props);

    this.state = {
      doorState: {
        left: {},
        middle: {},
        right: {}
      },
      buttonState: {
        left: { disabled: false },
        middle: { disabled: false },
        right: { disabled: false }
      },
      consoleMessage: '',
      username: ''
    };

  }

  async openClose(which_door: string) {
    const { buttonState, doorState } = this.state;
    buttonState[which_door].disabled = true;

    await API.post('api', '/message/5447bb99-4bef-4a27-86e3-f2cd6b0b98b0', {
      body: {
        message_type: 'toggle',
        payload: { which_door }
      }
    });
    
    if (doorState[which_door].is_open) {
      doorState[which_door].closing = true;
      doorState[which_door].opening = false;
    } else {
      doorState[which_door].closing = false;
      doorState[which_door].opening = true;
    }
    console.log('Toggling door.');

    
    this.setState({
      buttonState,
      doorState
    });
  }

  async getStatus() {
    const response = await API.get('api', '/status/5447bb99-4bef-4a27-86e3-f2cd6b0b98b0', undefined);
    const payload = response;
    return payload;
  }

  connect() {

    this.ws = new WebSocket(socketUrl);
    this.ws.onopen = () => {
      this.setState({
        consoleMessage: `Connected for updates: ${format(new Date(), 'MMMM do, yyyy H:mm')}`
      });
    };
    this.ws.onmessage = (e) => {
      console.log(JSON.stringify(e, undefined, 1));
      const message = JSON.parse(e.data);

      if (message.message_type === 'door_status') {
        const doorState = message.payload;
        const { buttonState } = this.state;

        buttonState.left.disabled = false;
        buttonState.right.disabled = false;
        buttonState.middle.disabled = false;

        this.setState({
          doorState,
          buttonState,
          consoleMessage: `Updated door status: ${format(new Date(), 'MMMM do, yyyy H:mm')}`
        });
      }
    };

    this.ws.onclose = (e) => {
      this.setState({
        consoleMessage: `Connection lost, reconnecting: ${format(new Date(), 'MMMM do, yyyy H:mm')}`
      });
      console.log('Socket is closed. Reconnect will be attempted in 1 second.', e.reason);
      setTimeout(() => {
        this.connect();
      }, 1000);
    };
  
    this.ws.onerror = (err: any) => {
      console.error('Socket encountered error: ', err.message, 'Closing socket');
      this.ws?.close();
    };
  }

  async initialize() {
    const user = await Auth.currentAuthenticatedUser();
    const { buttonState } = this.state;

    buttonState.left.disabled = false;
    buttonState.right.disabled = false;
    buttonState.middle.disabled = false;

    this.setState({
      doorState: await this.getStatus(),
      consoleMessage: `Updated door status: ${format(new Date(), 'MMMM do, yyyy H:mm')}`,
      username: user.getUsername()
    });

    this.connect();
  }

  async componentDidMount() {
    await this.initialize();
  }


  render(): ReactNode {
    const { doorState, buttonState } = this.state;
    const doorDisplays = {
      left: { icon: doorState.left.is_open ? faDoorOpen : faDoorClosed, text: doorState.left.is_open ? 'Open' : 'Closed' },
      middle: { icon: doorState.middle.is_open ? faDoorOpen : faDoorClosed, text: doorState.middle.is_open ? 'Open' : 'Closed' },
      right: { icon: doorState.right.is_open ? faDoorOpen : faDoorClosed, text: doorState.right.is_open ? 'Open' : 'Closed' },
    }
    return (
      <div className="container">
          <div className="columns">
              <div className="column">
                <button disabled={buttonState.left.disabled} className="button" aria-label={doorDisplays.left.text} onClick={() => this.openClose('left') } >Left Door 
                  <FontAwesomeIcon icon={doorDisplays.left.icon} /></button>
              </div>
              <div className="column">
                <button disabled={buttonState.middle.disabled} className="button" aria-label={doorDisplays.middle.text} onClick={() => this.openClose('middle') }>Middle Door 
                  <FontAwesomeIcon icon={doorDisplays.middle.icon} /></button>
              </div>
              <div className="column">
                <button disabled={buttonState.right.disabled} className="button" aria-label={doorDisplays.right.text} onClick={() => this.openClose('right') }>Right Door 
                  <FontAwesomeIcon icon={doorDisplays.right.icon} /></button>
              </div>
          </div>
      </div>
    )
  }
}

export default Openers;