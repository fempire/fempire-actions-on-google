const functions = require('firebase-functions');
const admin = require('firebase-admin');
const GeoFire = require('geofire');
const httpRequest = require('request');

exports.actionsOnGoogle = functions.https.onRequest((request, response) => {
  const intent = (request.body.queryResult.intent) ? request.body.queryResult.intent.displayName : 'default';
  const action = (request.body.queryResult.action) ? request.body.queryResult.action : 'default';
  const parameters = request.body.queryResult.parameters || {};
  const queryText = request.body.queryResult.queryText;
  const session = (request.body.session) ? request.body.session : undefined;

  const intentHandlers = {
    'who': () => {
      admin.database().ref(parameters.people).on('value', (snapshot) => {
        let count = 0;
        let person;
        const query = snapshot.val();
        const random = Math.round((snapshot.numChildren() - 1) * Math.random());
        for (let $key in query) {
          if (count === random) {
            person = query[$key];
            person['$key'] = $key;
            break;
          }
          count += 1;
        }
        const message = ['Someone you may be interested in is ' + person.name + '. '];
        if (person.location) {
          message.push('Located in ' + person.location + '. ');
        }
        if (person.topics && person.topics.length > 0) {
          message.push('They know a lot about ' + person.topics.join(', ') + '.');
        }
        sendResponse(message.join(' '));
      });
    },
    'organizations': () => {
      admin.database().ref('/organizations').on('value', (snapshot) => {
        let count = 0;
        let organization;
        const query = snapshot.val();
        const random = Math.round((snapshot.numChildren() - 1) * Math.random());
        for (let $key in query) {
          if (count === random) {
            organization = query[$key];
            organization['$key'] = $key;
            break;
          }
          count += 1;
        }
        sendResponse(organization.about + ' You can find out more about the ' + organization.name + ' at ' + organization.url);
      });
    },
    'geo': () => {
      httpRequest({
        method: 'GET',
        url: 'https://maps.googleapis.com/maps/api/geocode/json',
        qs: {
          address: parameters.location,
          key: functions.config().google.api
        }
      }, (error, response, body) => {
        if (error) {
          sendResponse(error.message);
        }
        const coordinates = JSON.parse(body).results[0].geometry.location;
        const people = [];
        const geofire = new GeoFire(admin.database().ref('geofire/' + parameters.people)).query({
            center: [coordinates.lat, coordinates.lng],
            radius: 15
          })
          .on('key_entered', (key, result) => {
            admin.database().ref(parameters.people + '/' + key).on('value', (snapshot) => {
              people.push(snapshot.val());
            });
          });
        setTimeout(() => {
          geofire.cancel();
          if (people.length === 0) {
            sendResponse('No one nearby found...');
          } else {
            const random = Math.round((people.length - 1) * Math.random());
            const person = people[random];
            const message = ['Someone near ' + parameters.location + ' is ' + person.name + '. '];
            if (person.topics && person.topics.length > 0) {
              message.push('They know a lot about ' + person.topics.join(', ') + '.');
            }
            sendResponse(message.join(' '));
          }
        }, 3000);
      });
    },
    'default': () => {
      sendResponse('Er, well, we might have blanked out on what we were supposed to do...');
    }
  };

  (!intentHandlers[intent]) ? intentHandlers['default'](): intentHandlers[intent]();

  function sendResponse(responseToUser) {
    if (typeof responseToUser === 'string') {
      response.json({
        fulfillmentText: responseToUser
      });
    } else {
      const responseJson = {};
      responseJson.fulfillmentText = responseToUser.fulfillmentText;
      if (responseToUser.fulfillmentMessages) {
        responseJson.fulfillmentMessages = responseToUser.fulfillmentMessages;
      }
      if (responseToUser.outputContexts) {
        responseJson.outputContexts = responseToUser.outputContexts;
      }
      response.json(responseJson);
    }
  }
});