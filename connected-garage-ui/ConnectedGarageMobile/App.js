
import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  Dimensions
} from 'react-native';

import {
  Colors
} from 'react-native/Libraries/NewAppScreen';

import { format } from 'date-fns'

const apiPrefix = 'https://vft02b5v9c.execute-api.us-east-2.amazonaws.com/dev'
const socketUrl = 'wss://870olo7mrh.execute-api.us-east-2.amazonaws.com/dev';

const openClose = async (which_door) => {
  await fetch(`${apiPrefix}/message/5447bb99-4bef-4a27-86e3-f2cd6b0b98b0`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message_type: 'toggle',
      payload: { which_door }
    })
  });
  console.log('Toggling door.');
}

const closedIcon = require(`./images/door-closed.png`);
const openIcon = require(`./images/door-open.png`);

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      doorState: {},
      width: Dimensions.get('window').width,
      height: Dimensions.get('window').height,
    };

    this.onLayout = this.onLayout.bind(this);

  }

  onLayout(e) {
    this.setState({
      width: Dimensions.get('window').width,
      height: Dimensions.get('window').height,
    });
  }

  async getStatus() {
    const response = await fetch(`${apiPrefix}/status/5447bb99-4bef-4a27-86e3-f2cd6b0b98b0`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    });
    const payload = await response.json();
    return payload;
  }

  async componentDidMount() {
    this.setState({
      doorState: await this.getStatus(),
      consoleMessage: `Updated door status: ${format(new Date(), 'MMMM do, yyyy H:mm')}`
    });

    this.ws = new WebSocket(socketUrl);
    this.ws.onopen = () => {

    };
    this.ws.onmessage = (e) => {
      console.log(JSON.stringify(e, undefined, 1));
      const message = JSON.parse(e.data)

      if (message.message_type === 'door_status') {
        this.setState({
          doorState: message.payload,
          consoleMessage: `Updated door status: ${format(new Date(), 'MMMM do, yyyy H:mm')}`
        });
      }
    };

    this.ws.onerror = (e) => {
      // an error occurred
      console.log(e.message);
    };

    this.ws.onclose = (e) => {
      // connection closed
      console.log(e.code, e.reason);
    };
  }


  render() {

    const { doorState, consoleMessage, width, height } = this.state;

    const leftIcon = doorState.left?.is_open ? openIcon : closedIcon;
    const middleIcon = doorState.middle?.is_open ? openIcon : closedIcon;
    const rightIcon = doorState.right?.is_open ? openIcon : closedIcon;


    const doorStateLeftText = doorState.left?.is_open ? 'Opened' : 'Closed';
    const doorStateMiddleText = doorState.middle?.is_open ? 'Opened' : 'Closed';
    const doorStateRightText = doorState.right?.is_open ? 'Opened' : 'Closed';


    return (
      <View
        style={{ ...styles.container, width, height }}
        onLayout={this.onLayout}>
        <View style={{...styles.sectionContainer }}>
          <Text style={{ ...styles.sectionTitle }}>Connected Garage</Text>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', flexDirection: width > height ? 'row' : 'column' }}>
            <TouchableOpacity style={styles.doorbutton} onPressOut={async () => await openClose('left')}>
              <Image style={styles.doorbuttonimage} source={leftIcon}></Image>
              <Text>{doorStateLeftText}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doorbutton} onPressOut={async () => await openClose('middle')}>
              <Image style={styles.doorbuttonimage} source={middleIcon}></Image>
              <Text>{doorStateMiddleText}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doorbutton} onPressOut={async () => await openClose('right')}>
              <Image style={styles.doorbuttonimage} source={rightIcon}></Image>
              <Text>{doorStateRightText}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{...styles.console }}>
          <Text style={{ height: 30 }}>{consoleMessage || 'Ready'}</Text>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.lighter,
    flex: 1
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
    color: Colors.darker,
    marginBottom: 36,
    height: 30,
    padding: 10
  },
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
    flex: 1,
    flexDirection: 'column'
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.black
  }
});

export default App;
