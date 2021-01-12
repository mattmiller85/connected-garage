import './App.css';
import Openers from './Openers';

import { withAuthenticator } from "aws-amplify-react";
import Amplify, { Auth } from 'aws-amplify';

import { config as getconfig } from './config';

import {
  BrowserRouter as Router,
  Switch,
  Route,
  Link,
  NavLink
} from "react-router-dom";
import React from 'react';

const config = getconfig();

  Amplify.configure({
    Auth: {
      region: config.cognito.userPoolRegion,
      userPoolId: config.cognito.userPoolId,
      userPoolWebClientId: config.cognito.userPoolWebClientId
    },
    API: {
      endpoints: config.apis,
    },
    Analytics: {
      disabled: true,
    },
  });

function App() {
  const [isNavbarActive, setisNavbarActive] = React.useState(false)
  return (
    <Router>
    
    <div className="">
    <div className="topheader">
        <header className="container">
        <nav className="navbar" role="navigation" aria-label="main navigation">
          <div className="navbar-brand">
            <a className="navbar-item" href="https://github.com/mattmiller85/connected-garage">
              <img src="https://static.thenounproject.com/png/108458-200.png" width="28" height="28" />
            </a>

            <a onClick={() => {
              setisNavbarActive(!isNavbarActive)
            }} role="button" className={`navbar-burger burger ${isNavbarActive ? 'is-active' : ''}`} 
              aria-label="menu" aria-expanded="false" data-target="navbarBasicExample">
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
            </a>
          </div>

          <div id="navbarBasicExample" className={`navbar-menu ${isNavbarActive ? 'is-active' : ''}`}>
            <div className="navbar-start">
              <NavLink to="/doors" activeClassName="is-active" className="navbar-item">
                Garage Doors
              </NavLink>

              <NavLink to="/lights" activeClassName="is-active" className="navbar-item">
                Lights
              </NavLink>

              <NavLink to="/climate" activeClassName="is-active" className="navbar-item">
                Climate
              </NavLink>
            </div>

            <div className="navbar-end">
              <div className="navbar-item">
                <div className="buttons">
                  <a className="button is-primary" onClick={() => Auth.signOut() }>
                    <strong>Logout</strong> { }
                  </a>
                </div>
              </div>
            </div>
          </div>
        </nav>
      </header>
    </div>
    <section className="results--section">
      <div className="container outlet">
        <Switch>
          <Route path="/doors">
            <Openers />
          </Route>
          <Route path="/lights">
            <div>lights here</div>
          </Route>
          <Route path="/climate">
            <div>temp/humidity here</div>
          </Route>
        </Switch>
      </div>
    </section>
  </div>
  </Router>
  );
}

export default withAuthenticator(App);
