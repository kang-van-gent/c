"use strict";

const admin = require("firebase-admin");
const functions = require("firebase-functions");
admin.initializeApp();
const express = require("express");
const request = require("request");
const app = express();
const api = express();
const db = admin.firestore();
const patientRef = db.collection("Patients");
const emerRef = db.collection("Emergencies");
const questionLibRef = db.collection("QuestionLib");
const meaningLibRef = db.collection("MeaningLib");
const answerRef = db.collection("Answers");
const bodyParser = require("body-parser");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.post("/emergencies/new", async (req, res) => {
  try {
    const eRef = emerRef.doc();
    const emergency = {
      id: eRef.id,
      phone: "",
      color: "",
      location: {
        latitude: null,
        longitude: null,
      },
      numberOfPatients: "",
      isPatients: false,
      isCovid: false,
      isAmbulanceSent: false,
      createdDate: new Date(),
      completedDate: null,
      ambulanceSentDate: null,
      callEndedDate: null,
      pleaseCall: "",
    };
    await eRef.set(emergency);

    res.send(emergency);
  } catch (err) {
    res.send(err.message);
  }
});

app.post("/patients/new/", async (req, res) => {
  const emerId = req.query.emergencyId;
  const num = req.query.number;

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
  /*
        {
            "location":{
                "lat":"123456",
                "lng":"654321"
            },
            "phone":"0817628551",
            "numberOfPatients":"3",
            "isPatients":false,
            "isCovid":false,
            "isAmbulanceSent":false,
            "pleaseCall":"0968870831"
        }
    */
  try {
    const id = req.query.emergencyId;
    const data = req.body;
    const emer = await emerRef.doc(id).update(data);

    res.send(emer);
  } catch (err) {
    res.send(err.message);
  }
});

app.put("/patients/update/", async (req, res) => {
  /*
    {
        "orderNumber" : 1,
        "isCovid" : false,
        "color" : "red",
        "answer" : [
            "ไม่","1","ไม่ใช่"
        ]
    }
    */
  try {
    const id = req.query.patientId;
    const data = req.body;
    const patient = await patientRef.doc(id).update(data);

    res.send(patient);
  } catch (err) {
    res.send(err.message);
  }
});

app.post("/ai/analyse", async (req, res) => {
  const qid = req.query.questionId;
  const dataType = req.body.dataType;
  const ans = req.body.answer;
  const emergId = req.body.emergencyId;
  const patientId = req.body.patientId;
  const repeatCount = req.body.repeatCount;
  const suggestCount = req.body.suggestCount;

  let order = {
    nextTo: "",
    isRepeat: false,
    label: "",
    suggestMeaning: "",
  };

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

  let meaning = {
    questionId: "",
    answer: "",
    meaning: 0,
    label: "",
  };

  try {
    const qd = (await questionLibRef.doc(qid).get()).data();
    if (qid === "a106") {
      //a106 จะไม่ใข้ AI เพราะเป็นการอธิบาย
      meaning = {
        questionId: qid,
        answer: answer.answer,
        meaning: 1,
        label: "",
      };
      order = {
        nextTo: qd["nextTo" + meaning.meaning],
        isRepeat: false,
        label: analyseLabel(answer, meaning), //ยังไงก็ได้เป็นสีเหลือง
      };
      answerRef.doc().set(answer);
    } else {
      if (dataType === "Phone") {
        meaning = checkPhoneMeaning(answer);
        if (meaning === 1) answerRef.doc().set(answer);
        order = {
          nextTo: qd["nextTo" + meaning.meaning],
          isRepeat: meaning.meaning === 1, //ให้ค่า true เมื่อ meaning.meaning == 1
          label: answer.answer,
        };
      } else if (dataType === "Number") {
        if (repeatCount >= 1) meaning = await analyseMeaning(answer, 2);
        else meaning = await analyseMeaning(answer, 1);

        if (meaning !== null) {
          answerRef.doc().set(answer);
          let re_mean = 0;
          if (meaning.meaning === 1) re_mean = 1; //ถ้า ไม่ใช่ 1 คนให้โอนสายไปหาเจ้าหน้าที่เลยก่อน
          order = {
            nextTo: qd["nextTo" + re_mean],
            isRepeat: false,
            label: meaning.label, // analyseLabel ส่งค่าสีกลับไปด้วย
          };
        } else {
          order = {
            nextTo: null,
            isRepeat: true,
            label: "Ask again",
          };
        }
      } else {
        if (repeatCount >= 1) meaning = await analyseMeaning(answer, 2);
        else meaning = await analyseMeaning(answer, 1);

        if (meaning !== null) {
          //ถ้ามี บันทึก answer ลงในฐานข้อมูล Answer
          answerRef.doc().set(answer);
          order = {
            nextTo: qd["nextTo" + meaning.meaning],
            isRepeat: false,
            label: analyseLabel(answer, meaning), // analyseLabel ส่งค่าสีกลับไปด้วย
          };
        } else {
          //ถ้าไม่มี ส่ง order ให้ถามอีกรอบ
          order = {
            nextTo: null,
            isRepeat: true,
            label: "Ask again",
          };
        }
      }
    }
    res.send(order);
  } catch (err) {
    res.send(err.message);
  }
});

app.post("/suggestion/learning", async (req, res) => {
  const qid = req.query.questionId;
  const dataType = req.body.dataType;
  const ans = req.body.answer;
  const emergId = req.body.emergencyId;
  const patientId = req.body.patientId;
  const repeatCount = req.body.repeatCount;
  const suggestCount = req.body.suggestCount;
  const suggestion = req.body.suggestion;

  let answer = {
    questionId: qid,
    answer: ans,
    dataType: dataType,
    date: new Date(),
    emergencyId: emergId,
    patientId: patientId,
    repeatCount: repeatCount,
    suggestCount: suggestCount,
    suggestion: suggestion
  };

  let order = {
    nextTo: "",
    isRepeat: false,
    label: "",
    suggestMeaning: "",
  };
  try {
    const qd = (await questionLibRef.doc(qid).get()).data();
    const suggestionMeaning = (
      await meaningLibRef
        .where("questionId", "==", qid)
        .where("answer", "==", suggestion)
        .get()
    ).docs[0].data(); //หา meaning ของ suggestion

    let ansmean = {meaning : 1}; //กำหนด meaning ของคำตอบ
    if (ans === "ไม่" || ans === "ไม่ใช่") ansmean.meaning = 0;

    switch (suggestionMeaning.meaning) {
      case 0:
        if (ansmean.meaning == 0) {
          //answerRef.doc().set(answer);
          order.nextTo = qd.nextTo1
          order.suggestMeaning = ans+suggestion
          order.label = analyseLabel(answer,ansmean)

        } else {
          //answerRef.doc().set(answer);
          order.nextTo = qd.nextTo0
          order.suggestMeaning = suggestion
          order.label = analyseLabel(answer,suggestionMeaning)
        }

        break;

      case 1:
        if (ansmean.meaning == 0) {
          //answerRef.doc().set(answer);
          order.nextTo = qd.nextTo0
          order.suggestMeaning = ans+suggestion
          order.label = analyseLabel(answer,ansmean)
        } else {
          //answerRef.doc().set(answer);
          order.nextTo = qd.nextTo1
          order.suggestMeaning = suggestion
          order.label = analyseLabel(answer,suggestionMeaning)
        }
        break;
      default:
    }
    res.send(order);
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
      if (meanings.empty) resolve(null);
      //ไม่พบ meaning ใดใน MeaningLibRef หมายความว่าต้องให้ client ตอบอีกรอบ
      else resolve(meanings.docs[0].data()); //ต้องการแค่เฉพาะสมาชิกตัวแรกใน array จากการ query
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
  let meaning = {
    questionId: answer.questionId,
    answer: answer.answer,
    label: answer.answer,
    meaning: 0,
  };

  if (isNaN(answer)) {
    const reg = /\d+/g;
    const result1 = answer.match(reg);
    const phone = String(result1[0] + result1[1] + result1[2]);
    const length = result1[0].length + result1[1].length + result1[2].length;
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

  return meaning;
}

function analyseLabel(answer, meaning) {
  let label = "";

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
