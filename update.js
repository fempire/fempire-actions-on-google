const request = require('request');
const admin = require('firebase-admin');
const { GeoFirestore } = require('geofirestore');

try {
 const serviceAccount = require('./serviceAccountKey.json');
 admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://' + serviceAccount['project_id'] + '.firebaseio.com'
});
} catch (e) {
  throw e;
}

const README_URL = 'https://raw.githubusercontent.com/fempire/women-tech-speakers-organizers/master/README.md';
const TWO_WEEKS = 1000 * 60 * 60 * 24 * 7;

const mdjson = require('mdjson');
const listtojson = require('listtojson');
const googleMapsClient = require('@google/maps').createClient({
  key: process.env.GOOGLE_API,
  Promise: Promise
});

const collections = ['speakers', 'organizers', 'mentors'];
const stop = 'Contributing';
const firestore = admin.firestore();
const createGeopoint = admin.firestore.GeoPoint;
const geofirestore = new GeoFirestore(firestore);
const updatedOnRef = admin.database().ref('updatedOn');

request({ method: 'GET', url: README_URL}, async (error, response, body) => {
  if (error) throw new Error(error);
  console.log('Updating Fempire');
  
  if (!body) {
    console.error('no readme');
    throw new Error('no readme');
  } else if ((new Date().getTime() - await getDBRef(updatedOnRef)) < TWO_WEEKS) {
    console.error('updates can only take place every two weeks');
    throw new Error('updates can only take place every two weeks');
  }
  
  const data = body.toString('utf8');
  const fempireJson = mdjson(data);
  let add = false;
  let collection;
  const result = {};
  collections.forEach((c) => result[c] = []);
  
  Object.getOwnPropertyNames(fempireJson).forEach(key => {
    if (collections.includes(key.toLowerCase())) {
      collection = key.toLowerCase();
      add = true;
    } else if (key === stop) {
      add = false;
    }
    if (add && fempireJson[key]['raw'].length) {
      result[collection].push(parseHTML(key, fempireJson[key]['html']));
    }
  });
  
  collections.forEach((c) => console.log(`${result[c].length} ${c} parsed`));
  
  updateDatabase(result).then(() => {
    console.log('fempire database updated');
    process.exit(0);
  });
});

async function updateDatabase(fempire) {
  const batches = [];
  for (const collection of collections) {
    console.log(`batching ${collection}`);
    let count = 0;
    let batch = firestore.batch();
    let geobatch = geofirestore.batch();
    for (let i = 0; i < fempire[collection].length; i++) {
      if (i !== 0 && i % 500 === 0) {
        console.log(`${count} batched for ${collection}`);
        count = 0;
        batches.push(batch.commit().catch(e => console.log(e.message)));
        batch = firestore.batch();
        batches.push(geobatch.commit().catch(e => console.log(e.message)));
        geobatch = geofirestore.batch();
      }
      const person = fempire[collection][i];
      const uid = person.name.toLowerCase().replace(/\s/g, '-');
      const doc = firestore.collection(collection).doc(uid);
      const geodoc = firestore.collection(`geo${collection}`).doc(uid);
      if (person.location.length) {
        person.coordinates = await geocode(person.location);
        geobatch.set(geodoc, person);
      }
      batch.set(doc, person);
      count++;
    };
    console.log(`${count} batched for ${collection}`);
    batches.push(batch.commit().catch(e => console.log(e.message)));
    batches.push(geobatch.commit().catch(e => console.log(e.message)));
  }
  return Promise.all(batches).then(() => updatedOnRef.set({'.sv': 'timestamp'}));
}

function parseHTML(name, html) {
  const result = {
    name,
    topics: [],
    location: '',
    twitter: '',
    urls: [],
    languages: []
   };
  const ul = listtojson.convert(html)[0];

  ul.forEach((li) => {
    if (li.search(/^Topics.*[-:]/) !== -1) {
      li.replace(/^Topics.*[-:]/, '').split(',').forEach((t) => result['topics'].push(t.trim()));
    } else if (li.search(/^Group Focus.*[-:]/) !== -1) {
      li.replace(/^Group Focus.*[-:]/, '').split(',').forEach((t) => result['topics'].push(t.trim()));
    } else if (li.search(/^Location.*[-:]/) !== -1) {
      result['location'] = li.replace(/^Location.*[-:]/, '').trim();
    } else if (li.match(/http(?:s)?:\/\/(?:www\.)?twitter\.com\/([a-zA-Z0-9_]+)/g)) {
      // @ts-ignore
      result['twitter'] = li.match(/http(?:s)?:\/\/(?:www\.)?twitter\.com\/([a-zA-Z0-9_]+)/gm)[0];
    } else if (li.match(/http(?:s)?:\/\/(?:www\.)?([a-zA-Z0-9_]*).com\/([a-zA-Z0-9/_-]+)/g)) {
      // @ts-ignore
      result['urls'].push(li.match(/http(?:s)?:\/\/(?:www\.)?([a-zA-Z0-9_]*).com\/([a-zA-Z0-9/_-]+)/gm)[0]);
    } else if (li.search(/^Languages.*[-:]/) !== -1) {
      li.replace(/^Languages.*[-:]/, '').split(',').forEach((t) => result['languages'].push(t.trim()));
    }
  });

  return result;
}

async function geocode(address) {
  return googleMapsClient.geocode({ address }).asPromise()
    .then((geocoded) => {
      if (geocoded.json.results.length) {
        const location = geocoded.json.results[0]['geometry']['location'];
        return new createGeopoint(location.lat, location.lng);
      } else {
        return new createGeopoint(0, 0);
      }
    })
    .catch((e) => new createGeopoint(0, 0));
}

async function getDBRef(ref) {
  return new Promise(async (resolve) => {
    return ref.once('value', (snapshot) => {
      resolve(snapshot.val());
    }, () => {
      resolve(new Date().getTime());
    })
  });
}
