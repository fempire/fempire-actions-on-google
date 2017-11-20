const functions = require('firebase-functions');
const admin = require('firebase-admin');
let serviceAccount;

try {
  serviceAccount = require('./serviceAccountKey.json');
} catch (e) {}

if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://' + serviceAccount['project_id'] + '.firebaseio.com'
  });
} else {
  admin.initializeApp(functions.config().firebase);
}

exports.profileOnCreate = require('./profile').profileOnCreate;
exports.profileOnUpdate = require('./profile').profileOnUpdate;
exports.applicationOnUpdate = require('./application').applicationOnUpdate;
exports.actionsOnGoogle = require('./actions-on-google').actionsOnGoogle;