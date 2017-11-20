const functions = require('firebase-functions');
const admin = require('firebase-admin');
const GeoFire = require('geofire');
const httpRequest = require('request');

function setIndex(id, profile, type) {
  const ref = admin.database().ref(type);
  const geoFire = new GeoFire(admin.database().ref('/geofire/' + type));
  ref.child(id).set(profile).then(() => {
    if (profile.location) {
      httpRequest({
        method: 'GET',
        url: 'https://maps.googleapis.com/maps/api/geocode/json',
        qs: {
          address: profile.location,
          key: functions.config().google.api
        }
      }, (error, response, body) => {
        if (error) {
          throw new Error(error);
        }
        const coordinates = JSON.parse(body).results[0].geometry.location;
        return geoFire.set(id, [coordinates.lat, coordinates.lng]);
      });
    } else {
      return geoFire.remove(id);
    }
  });
}

exports.profileOnCreate = functions.auth.user().onCreate((event) => {
  const profiles = admin.database().ref('/profiles');
  profiles.child(event.data.uid).set({
    name: event.data.displayName,
    photo: event.data.photoURL
  });
});

exports.profileOnUpdate = functions.database.ref('/profiles/{id}').onUpdate((event) => {
  const profile = event.data.val();
  const id = event.params.id;
  if (profile.speaker) {
    setIndex(id, profile, 'speakers');
  }
  if (profile.organizer) {
    setIndex(id, profile, 'organizers');
  }
  if (profile.mentor) {
    setIndex(id, profile, 'mentors');
  }
  return event;
});
