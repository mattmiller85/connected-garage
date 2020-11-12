
import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  Dimensions,
  Button
} from 'react-native';

import {
  Colors
} from 'react-native/Libraries/NewAppScreen';

import { format } from 'date-fns'

import Amplify, { API, Auth } from "aws-amplify";
import { withAuthenticator } from "aws-amplify-react-native";
import getconfig from "./config";

const config = getconfig();
Amplify.configure({
  Auth: {
    region: config.cognito.userPoolRegion,
    userPoolId: config.cognito.userPoolId,
    userPoolWebClientId: config.cognito.userPoolWebClientId,
    identityPoolId: config.cognito.identityPoolID,
  },
  API: {
    endpoints: config.apis,
  },
  Analytics: {
    disabled: true,
  },
});
const socketUrl = config.socketUrl;

const closedIcon = require(`./images/door-closed.png`);
const openIcon = require(`./images/door-open.png`);

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      doorState: {
        left: {},
        middle: {},
        right: {}
      },
      width: Dimensions.get('window').width,
      height: Dimensions.get('window').height,
      buttonState: {
        left: { disabled: false },
        middle: { disabled: false },
        right: { disabled: false }
      }
    };

    this.onLayout = this.onLayout.bind(this);

  }

  onLayout(e) {
    this.setState({
      width: Dimensions.get('window').width,
      height: Dimensions.get('window').height,
    });
  }

  async openClose(which_door, event) {
    await API.post('api', '/message/5447bb99-4bef-4a27-86e3-f2cd6b0b98b0', {
      body: {
        message_type: 'toggle',
        payload: { which_door }
      }
    });
    const { buttonState, doorState } = this.state;
    if (doorState[which_door].is_open) {
      doorState[which_door].closing = true;
      doorState[which_door].opening = false;
    } else {
      doorState[which_door].closing = false;
      doorState[which_door].opening = true;
    }
    console.log('Toggling door.');

    buttonState[which_door].disabled = true;
    this.setState({
      buttonState,
      doorState
    });
  }

  async getStatus() {
    const response = await API.get('api', '/status/5447bb99-4bef-4a27-86e3-f2cd6b0b98b0');
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
          consoleMessage: `Updated door status: ${format(new Date(), 'MMMM do, yyyy H:mm')}`,
          buttonState
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
  
    this.ws.onerror = (err) => {
      console.error('Socket encountered error: ', err.message, 'Closing socket');
      this.ws.close();
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

  render() {

    const { doorState, buttonState, consoleMessage, width, height, username } = this.state;

    const getStateText = (door) => {
      if (door?.unknown) {
        return 'Unknown';
      }
      return door?.opening ? 'Opening' :
        door?.closing ? 'Closing' :
          door?.is_open ? 'Opened' : 'Closed';
    }
    const leftIcon = doorState.left?.is_open ? openIcon : closedIcon;
    const middleIcon = doorState.middle?.is_open ? openIcon : closedIcon;
    const rightIcon = doorState.right?.is_open ? openIcon : closedIcon;

    const doorStateLeftText = getStateText(doorState.left);
    const doorStateMiddleText = getStateText(doorState.middle);
    const doorStateRightText = getStateText(doorState.right);

    return (
      <View
        style={{ ...styles.container, width, height }}
        onLayout={this.onLayout}>
        <View style={{ ...styles.sectionContainer }}>
          <Text style={{ ...styles.sectionTitle }}>Connected Garage</Text>
          <View style={{ ...styles.user, width }}>
            <Text>{username}</Text>
            <View style={{flexDirection:'row' }}>
              <Button onPress={async () => await this.initialize() } title="Reload"></Button>
              <Button onPress={async () => await Auth.signOut()} title="Logout"></Button>
            </View>
            
          </View>
          <View style={{ flex: 1, justifyContent: 'space-evenly', alignItems: 'center', flexDirection: width > height ? 'row' : 'column' }}>
            <TouchableOpacity disabled={buttonState.left.disabled}
              style={{ ...styles.doorbutton, opacity: buttonState.left.disabled ? 0.5 : 1 }}
              onPressOut={async (e) => await this.openClose('left', e)}>
              <Image style={styles.doorbuttonimage} source={leftIcon}></Image>
              <Text>Left: {doorStateLeftText}</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={buttonState.middle.disabled}
              style={{ ...styles.doorbutton, opacity: buttonState.middle.disabled ? 0.5 : 1 }}
              onPressOut={async (e) => await this.openClose('middle', e)}>
              <Image style={styles.doorbuttonimage} source={middleIcon}></Image>
              <Text>Middle: {doorStateMiddleText}</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={buttonState.right.disabled}
              style={{ ...styles.doorbutton, opacity: buttonState.right.disabled ? 0.5 : 1 }}
              onPressOut={async (e) => await this.openClose('right', e)}>
              <Image style={styles.doorbuttonimage} source={rightIcon}></Image>
              <Text>Right: {doorStateRightText}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ ...styles.console, width }}>
          <Text style={{ height: 30, fontStyle: 'italic' }}>{consoleMessage || 'Ready'}</Text>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#d1d1d1',
    flex: 1,
    alignItems: 'center'
  },
  engine: {
    position: 'absolute',
    right: 0,
  },
  doorbuttonimage: {
    width: 100,
    height: 100
  },
  doorbutton: {
    alignItems: 'center'
  },
  console: {
    backgroundColor: '#e1e1e1',
    height: 50,
    paddingTop: 5,
    alignItems: 'center'
  },
  sectionContainer: {
    marginTop: 32,
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center'
  },
  sectionTitle: {
    fontSize: 40,
    fontWeight: '600',
    color: Colors.black,
    alignItems: 'center',
    marginTop: 20
  },
  user: {
    paddingTop: 5,
    paddingRight: 5,
    backgroundColor: '#e1e1e1',
    alignItems: 'flex-end'
  }
});

export default withAuthenticator(App);
