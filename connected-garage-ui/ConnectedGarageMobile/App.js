
import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity
} from 'react-native';

import {
  Colors
} from 'react-native/Libraries/NewAppScreen';

const apiPrefix = 'https://vft02b5v9c.execute-api.us-east-2.amazonaws.com/dev'

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

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      doorState: {}
    };
    this.ws = new WebSocket('ws://host.com/path');
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
    this.setState({ doorState: await this.getStatus() });
    this.ws.onopen = () => {
     
    };
    
    this.ws.onmessage = (e) => {
      const message = JSON.parse(e.data)
      if (message.message_type === 'door_status') {
        this.setState({ doorState: message.payload });
      }
      console.log(e.data);
    };
    
    this.ws.onerror = (e) => {
      // an error occurred
      // console.log(e.message);
    };
    
    this.ws.onclose = (e) => {
      // connection closed
      // console.log(e.code, e.reason);
    };
  }

  render() {
    
    const { doorState } = this.state;

    return (
      <View
            contentInsetAdjustmentBehavior="automatic"  
            style={styles.container}>
        <View style={styles.body}>
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Connected Garage</Text>
            <View style={{ ...styles.sectionContainer, flex: 1, flexDirection: 'row', flexShrink: 1, flexWrap: 1 }}>
              <TouchableOpacity onPressOut={async () => await openClose('left') }>
                <Image style={{ width: 100, height: 100, marginRight: 5 }} source={require('./images/door-1.png')}></Image>
                <Text>{doorState.left?.is_open ? 'open': 'closed'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPressOut={async () => await openClose('middle') }>
                <Image style={{ width: 100, height: 100, marginRight: 5 }} source={require('./images/door-1.png')}></Image>
              </TouchableOpacity>
              <TouchableOpacity onPressOut={async () => await openClose('right') }>
                <Image style={{ width: 100, height: 100 }} source={require('./images/door-1.png')}></Image>
                
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <View style={styles.console}>
          
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.lighter,
    flex: 1,
    alignItems: "center"
  },
  engine: {
    position: 'absolute',
    right: 0,
  },
  body: {
    flex: 1
  },
  console: {
    flex: 1,
    justifyContent: 'flex-end',
    color: Colors.darker,
    marginBottom: 36,
    height: 30
  },
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.black,
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
    color: Colors.dark,
  },
  highlight: {
    fontWeight: '700',
  },
  footer: {
    color: Colors.dark,
    fontSize: 12,
    fontWeight: '600',
    padding: 4,
    paddingRight: 12,
    textAlign: 'right',
  },
});

export default App;
