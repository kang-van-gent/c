"use strict";

const admin = require("firebase-admin");
const functions = require("firebase-functions");
admin.initializeApp();
const express = require("express");
const request = require("request");
const cors = require('cors');
const app = express();
app.use(cors({origin: true}));
const api = express();
const db = admin.firestore();
const patientRef = db.collection("Patients");
const emerRef = db.collection("Emergencies");
const questionLibRef = db.collection("QuestionLib");
const meaningLibRef = db.collection("MeaningLib");
const answerRef = db.collection("Answers");
const callingRef = db.collection("Calls");
const testRef = db.collection("Tests");
const bodyParser = require("body-parser");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get("/network", async(req, res) => {
  try{
    res.status(200)
    res.send(true)
  }catch(err){
    res.status(500)
    res.send(false)
  }
})

api.get("/emergencies/clear", async (req, res) => {
  try {
    await deleteCollection(db, "Emergencies", 99);
    res.send(true)
  } catch (error) {
    res.send(error)
  }
})

api.get("/answers/clear", async (req, res) => {
  try {
    await deleteCollection(db, "Answers", 99);
    res.send(true)
  } catch (error) {
    res.send(error)
  }
})

api.get("/callings/clear", async (req, res) => {
  try {
    await deleteCollection(db, "Callings", 99);
    res.send(true)
  } catch (error) {
    res.send(error)
  }
})

api.get("/patients/clear", async (req, res) => {
  try {
    await deleteCollection(db, "Patients", 99);
    res.send(true)
  } catch (error) {
    res.send(error)
  }
})

app.get("/emergencies", async (req, res) => {
  try {
    const id = req.query.id
    let emer = (await emerRef.doc(id).get()).data()

    res.send(emer)
  } catch (error) {
    res.send(error)
  }
})

app.post("/emergencies/new", async (req, res) => {
  try {
    //await testRef.add({a: req.body})
    //res.send(req.body)
    const body = JSON.parse(req.body.data)
    const platform = body.platform
    const location = body.location
    const eRef = emerRef.doc();
    const emergency = {
      id: eRef.id,
      eid: eRef.id,
      phone: "",
      color: "",
      location: {
        latitude: location.latitude,
        longitude: location.longitude
      },
      numberOfPatients: 1,
      isPatient: false,
      isCovid: false,
      isAmbulanceSent: false,
      createdDate: new Date(),
      completedDate: null,
      ambulanceSentDate: null,
      callEndedDate: null,
      pleaseCall: "",
      platform: platform
    };
    await eRef.set(emergency);

    res.send(emergency);
  } catch (err) {
    res.send(err.message);
  }
});

app.post("/patients/new/", async (req, res) => {
  const body = JSON.parse(req.body.data)
  const emerId = body.emergencyId;
  const num = body.number;

  let patients = [];

  try {
    for (let i = 0; i < num; i++) {
      const pRef = patientRef.doc();
      const p = {
        id: pRef.id,
        emergencyId: emerId,
        order: 0,
        color: "",
        completedDate: null,
        isCovid: false,
      };
      patients.push(p);
      pRef.set(p);
    }
    res.send(patients);
  } catch (err) {
    res.send(err.message);
  }
});

app.put("/emergencies/update/", async (req, res) => {
  try {
    var body = JSON.parse(req.body.data)
    const id = body.id;
    
    //pre cast data
    if(body.createdDate !== null) body.createdDate = new Date(body.createdDate)
    if(body.completedDate !== null) body.completedDate = new Date(body.completedDate)
    if(body.ambulanceSentDate !== null) body.ambulanceSentDate = new Date(body.ambulanceSentDate)
    if(body.callEndedDate !== null) body.callEndedDate = new Date(body.callEndedDate)
  
    const emer = await emerRef.doc(id).update(body);

    res.send(emer);
  } catch (err) {
    res.send(err.message);
  }
});

app.put("/patients/update/", async (req, res) => {
  try {
    var body = JSON.parse(req.body.data)
    const id = body.id;

    //precast
    if(body.completedDate !== null) body.completedDate = new Date(body.completedDate)

    const patient = await patientRef.doc(id).update(body);

    res.send(patient);
  } catch (err) {
    res.send(err.message);
  }
});

app.post("/ai/analyse", async (req, res) => {
  const body = JSON.parse(req.body.data)
  const qid = body.questionId;
  const dataType = body.dataType;
  const ans = body.answer;
  const emergId = body.emergencyId;
  const patientId = body.patientId;
  const repeatCount = body.repeatCount;
  const suggestCount = body.suggestCount;

  let answer = {
    questionId: qid,
    answer: ans,
    dataType: dataType,
    date: new Date(),
    emergencyId: emergId,
    patientId: patientId,
    repeatCount: repeatCount,
    suggestCount: suggestCount,
  };

  const qd = (await questionLibRef.doc(answer.questionId).get()).data();

  try {
    let order = {};
    let meaning = {};
    if (qid === "a106") {
      meaning = ConstructMeaning(answer.questionId, answer.answer, "", 1);
      answerRef.doc().set(answer);
      order = ConstructOrder(
        answer.questionId,
        await analyseLabel(answer, meaning),
        qd["nextTo" + meaning.meaning],
        false,
        false,
        null
      );
    } else if (dataType === "Phone") {
      meaning = await checkPhoneMeaning(answer);
      if (meaning === 1)answerRef.doc().set(answer);
      order = ConstructOrder(
        answer.questionId,
        meaning.label,
        qd["nextTo" + meaning.meaning],
        meaning.meaning !== 1,
        false,
        null
      );
    } else {
      if (repeatCount > 2) {
        meaning = await analyseMeaning(answer, 2);
        order = ConstructOrder(
          answer.questionId,
          "",
          "z403",
          false,
          true,
          meaning
        );
      } else {
        meaning = await analyseMeaning(answer, 1);
        if (meaning === null) {
          order = ConstructOrder(
            answer.questionId,
            "",
            "z404",
            true,
            false,
            null
          );
        } else {
          if (answer.dataType === "Number") {
            if (meaning.meaning !== 1) meaning.meaning === 0;
          }
          answerRef.doc().set(answer);
          order = ConstructOrder(
            answer.questionId,
            await analyseLabel(answer, meaning),
            qd["nextTo" + meaning.meaning],
            false,
            false,
            null
          );
        }
      }
    }
    res.send(order);
  } catch (err) {
    res.send(err.message);
  }
});

app.post("/ai/learning", async (req, res) => {
  const body = JSON.parse(req.body.data)
  const qid = body.questionId;
  const dataType = body.dataType;
  const ans = body.answer;
  const emergId = body.emergencyId;
  const patientId = body.patientId;
  const repeatCount = body.repeatCount;
  const suggestCount = body.suggestCount;
  const oldAns = body.old;
  const suggestMeaning = body.suggestMeaning;

  let answer = {
    questionId: qid,
    answer: ans,
    dataType: dataType,
    date: new Date(),
    emergencyId: emergId,
    patientId: patientId,
    repeatCount: repeatCount,
    suggestCount: suggestCount,
  };

  try {
    if (suggestCount > 1) {
      const order = ConstructOrder(oldAns.questionId, "", "z100", false, false, null);
      res.send(order);
    } else {
      const aiMeaning = await analyseMeaning(answer, 2);
      const qd = (await questionLibRef.doc(aiMeaning.questionId).get()).data();
      if (aiMeaning.meaning === 1) {
        const order = await ConstructOrder(
          aiMeaning.questionId,
          analyseLabel(oldAns, aiMeaning),
          qd["nextTo" + aiMeaning.meaning],
          false,
          false,
          null
        );
        await res.send(order);

        const meaning = await ConstructMeaning(
          oldAns.questionId,
          oldAns.answer,
          suggestMeaning.label,
          suggestMeaning.meaning
        );
        await meaningLibRef.doc().set(meaning);
      } else {
        const OldMeaning = await analyseMeaning(oldAns, 2);
        const order = await ConstructOrder(
          oldAns.questionId,
          "",
          "z100",
          false,
          false,
          OldMeaning
        );
        await res.send(order);
      }
    }
  } catch (e) {
    res.send(e);
  }
});

app.get("/callings", async (req, res) => {
  try {
    const id = req.query.id
    let calling = (await callingRef.doc(id).get()).data()

    res.send(calling)
  } catch (error) {
    res.send(error)
  }
})

app.post("/callings/new", async (req, res) => {
  try {
    var body = JSON.parse(req.body.data)

    //precast
    if(body.startAt !== null) body.startAt = new Date(body.startAt)
    if(body.endAt !== null) body.endAt = new Date(body.endAt)
    if(body.receiveAt !== null) body.receiveAt = new Date(body.receiveAt)

    body = await AddToCallingSetId(body.emergencyId, body);
    res.send(body);
  } catch (err) {
    res.send(err.message);
  }
});

app.put("/callings/update", async (req, res) => {
  try {
    var body = JSON.parse(req.body.data)

    //precast
    if(body.startAt !== null) body.startAt = new Date(body.startAt)
    if(body.endAt !== null) body.endAt = new Date(body.endAt)
    if(body.receiveAt !== null) body.receiveAt = new Date(body.receiveAt)

    await callingRef.doc(body.id).update(body)

    res.send(body)
  } catch (err) {
    res.send(err.message);
  }
});
exports.app = functions.https.onRequest(app);
exports.admin = functions.https.onRequest(api);

async function analyseMeaning(answer, mode) {
  //2 ระบบในฟังก์ชั่นเดียว #1 จากการ query ใน firestore, #2 จากการ request ไปยัง app engine
  return new Promise(async (resolve, reject) => {
    if (mode === 1) {
      const meanings = await meaningLibRef
        .where("questionId", "==", answer.questionId)
        .where("answer", "==", answer.answer)
        .get();
      if (meanings.size > 0){
        resolve(meanings.docs[0].data());       //ไม่พบ meaning ใดใน MeaningLibRef หมายความว่าต้องให้ client ตอบอีกรอบ
      }else{
        resolve(null); //ต้องการแค่เฉพาะสมาชิกตัวแรกใน array จากการ query
      }
    } else {
      const options = {
        url: "https://covid19-test-a70c0.uc.r.appspot.com/api",
        body: answer,
        json: true,
        method: "post",
      };
      request(options, (error, response, body) => {
        if (error) reject(error);
        else resolve(response.body);
      });
    }
  });
}

function checkPhoneMeaning(answer) {
  return new Promise((resolve, reject) => {
    let meaning = {
      questionId: answer.questionId,
      answer: answer.answer,
      label: answer.answer,
      meaning: 0,
    };
  
    if (isNaN(answer)) {
      const reg = /\d+/g;
      const result1 = answer.answer.match(reg);
      let phone = ""
      result1.forEach(function(item) {
        phone = phone + item
      });
      meaning.label = phone;
      const length = phone.length;
      const prefix = phone[0] + phone[1];
      if (prefix === "06" || prefix === "08" || prefix === "09") {
        if (length === 10) meaning.meaning = 1;
        else meaning.meaning = 0;
      } else if (
        prefix === "02" ||
        prefix === "03" ||
        prefix === "05" ||
        prefix === "04" ||
        prefix === "07"
      ) {
        if (length === 9) meaning.meaning = 1;
        else meaning.meaning = 0;
      }
    } else {
      const prefix = answer[0] + answer[1];
      if (prefix === "06" || prefix === "08" || prefix === "09") {
        if (answer.length === 10) meaning.meaning = 1;
        else meaning.meaning = 0;
      } else if (
        prefix === "02" ||
        prefix === "03" ||
        prefix === "05" ||
        prefix === "04" ||
        prefix === "07"
      ) {
        if (answer.length === 9) meaning.meaning = 1;
        else meaning.meaning = 0;
      }
    }
  
    resolve(meaning);
  });
}

function analyseLabel(answer, meaning) {
  let label = meaning.label;

  switch (answer.questionId) {
    case "a102":
      if (meaning.meaning === 0) label = "red";
      break;
    case "a103":
      if (meaning.meaning >= 1) label = "red";
      break;
    case "a105":
      if (meaning.meaning >= 1) label = "yellow";
      break;
    case "a106":
      if (meaning.meaning >= 1) label = "yellow";
      break;
    case "a107":
      if (meaning.meaning === 0) label = "yellow";
      else label = "green"; //เป็นคำถามสุดท้ายที่คัดกรองกลุ่ม สีเหลือง
      break;
    case "b100":
      if (meaning.meaning >= 1) label = "covid";
      break;
    case "b101":
      if (meaning.meaning >= 1) label = "covid";
      break;
    default:
      label = meaning.label;
  }

  return label;
}

function ConstructOrder(qid, lab, nt, isR, isS, sM) {
  let order = {
    questionId: qid,
    label: lab,
    nextTo: nt,
    isRepeat: isR,
    isSuggest: isS,
    suggestMeaning: sM,
  };
  return order;
}

function ConstructMeaning(qid, ans, lab, mean) {
  let meaning = {
    questionId: qid,
    answer: ans,
    label: lab,
    meaning: mean,
  };

  return meaning;
}

function AddToCallingSetId(id, calling) {
  return new Promise((resolve, reject) => {
    callingRef.doc(id).set(calling).then(() => {
      calling.id = id
      resolve(calling)
      return
    }).catch(error => {
      reject(error)
      return
    })
  })
}

async function deleteCollection(db, collectionPath, batchSize) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(db, query, resolve) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    // When there are no documents left, we are done
    resolve();
    return;
  }

  // Delete documents in a batch
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
}

