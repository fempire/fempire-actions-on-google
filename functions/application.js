const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.applicationOnUpdate = functions.database.ref('/applications/{id}').onUpdate((event) => {
  const profiles = admin.database().ref('/profiles');
  const applications = admin.database().ref('/applications');
  const application = event.data.val();
  const id = event.params.id;
  if (application.approved) {
    switch (application.type.toUpperCase()) {
      case 'SPEAKER':
        return profiles.child(application.uid).update({
          'speaker': true
        }).then(() => applications.child(id).remove());
        break;
      case 'ORGANIZER':
        return profiles.child(application.uid).update({
          'organizer': true
        }).then(() => applications.child(id).remove());
        break;
      case 'MENTOR':
        return profiles.child(application.uid).update({
          'mentor': true
        }).then(() => applications.child(id).remove());
        break;
      default:
        return applications.child(id).remove();
        break;
    }
  } else {
    return applications.child(id).remove();
  }
});
