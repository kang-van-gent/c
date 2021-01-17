"use strict";

const admin = require("firebase-admin");
const functions = require("firebase-functions");
admin.initializeApp();
const express = require("express");
var request = require("request");
const app = express();
const api = express();
let db = admin.firestore();
let pateintsRef = db.collection("Patients");
let emerRef = admin.firestore().collection("Emergencies");
let questionsLib = db.collection("QuestionLib");
let meaningLib = db.collection("MeaningLib")
let answerRef = db.collection("Answers")
const bodyParser = require("body-parser");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const genId = function () {
  const id = Math.random().toString(36).slice(-8);
  return id;
};

app.post("/emergencies/new", async (req, res) => {
  try {
    const uid = genId();
    const emergency = {
      userId: uid,
      location: {
        Lat: null,
        Lng: null,
      },
      phone: "",
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
    await emerRef.doc(uid).set(emergency);
    res.send(emergency);
  } catch (err) {
    res.send(err.message);
  }
});

app.post("/patients/new/", async (req, res) => {
  let emerId = req.query.emergencyId;
  let num = req.query.number;
  try {
    for (let i = 0; i < num; i++) {
      const patients = {
        EmergencyId: emerId,
        OrderNumber: 0,
        Color: "",
        Answers: {},
        CompleteDate: null,
        isCovid: false,
      };

      pateintsRef.doc(genId()).set(patients);
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
    const emer = emerRef.doc(id);
    await emer.update({
      location: req.body.location,
      phone: req.body.phone,
      numberOfPatients: req.body.numberOfPatients,
      isPatients: req.body.isPatients,
      isCovid: req.body.isCovid,
      isAmbulanceSent: req.body.isAmbulanceSent,
      callEndDate: new Date(),
      pleaseCall: req.body.pleaseCall,
    });
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
    const patient = pateintsRef.doc(id);
    await patient.update({
      OrderNumber: req.body.orderNumber,
      isCovid: req.body.isCovid,
      Color: req.body.color,
      CompleteDate: new Date(),
      Answer: req.body.answer,
    });
    res.send(patient);
  } catch (err) {
    res.send(err.message);
  }
});

app.post("/ai/analyse", async (req, res) => {
  const qid = req.query.questionId
  const dataType = req.body.dataType
  const ans = req.body.answer
  const emergId = req.body.emergencyId
  const patientId = req.body.patientId
  const repeatCount = req.body.repeatCount
  const suggestCount = req.body.suggestCount

  let order = {
    nextTo: "",
    isRepeat: false,
    label: "",
    suggestMeaning: ""
  }

  let answer = {
    questionId: qid,
    answer: ans,
    dataType: dataType,
    date: new Date(),
    emergencyId: emergId,
    patientId: patientId,
    repeatCount: repeatCount,
    suggestCount: suggestCount
  }

  let meaning = {
    questionId: "",
    answer: "",
    meaning: 0,
    label: ""
  }

  try {
    const qd = (await questionsLib.doc(qid).get()).data()
    if (qid === 'a106') { //a106 จะไม่ใข้ AI เพราะเป็นการอธิบาย
      meaning = {
        questionId: qid,
        answer: answer.answer,
        meaning: 1,
        label: "" 
      }
      order = {
        nextTo: qd['nextTo' + meaning.meaning],
        isRepeat: false,
        label: analyseLabel(answer, meaning) //ยังไงก็ได้เป็นสีเหลือง
      }
      answerRef.doc().set(answer)
    } else {
      if (dataType === "Phone") {
        meaning = checkPhoneMeaning(answer);
        if(meaning === 1) answerRef.doc().set(answer)
        order = {
          nextTo: qd['nextTo' + meaning.meaning],
          isRepeat: (meaning.meaning === 1), //ให้ค่า true เมื่อ meaning.meaning == 1
          label: answer.answer
        }
      }else if(dataType === 'Number'){ 
        if(repeatCount >= 1) meaning = await analyseMeaning(answer, 2)
        else meaning = await analyseMeaning(answer, 1)

        if(meaning !== null){
          answerRef.doc().set(answer)
          let re_mean = 0
          if (meaning.meaning === 1) re_mean = 1; //ถ้า ไม่ใช่ 1 คนให้โอนสายไปหาเจ้าหน้าที่เลยก่อน
          order = {
            nextTo: qd['nextTo' + re_mean],
            isRepeat: false,
            label: "Numbers of patient" // analyseLabel ส่งค่าสีกลับไปด้วย
          }
        }else{
          order = {
            nextTo: null,
            isRepeat: true,
            label: "Ask again"
          }
        }
      }else {
        if(repeatCount >= 1) meaning = await analyseMeaning(answer, 2)
        else meaning = await analyseMeaning(answer, 1)

        if (meaning !== null) { //ถ้ามี บันทึก answer ลงในฐานข้อมูล Answer
          answerRef.doc().set(answer)
          order = {
            nextTo: qd['nextTo' + meaning.meaning],
            isRepeat: false,
            label: analyseLabel(answer, meaning) // analyseLabel ส่งค่าสีกลับไปด้วย
          }
        } else { //ถ้าไม่มี ส่ง order ให้ถามอีกรอบ
          order = {
            nextTo: null,
            isRepeat: true,
            label: "Ask again"
          }
        }
      }
    }
    res.send(order);
  } catch (err) {
    res.send(err.message);
  }
});


api.post("/checkphone", (req, res) => {
  /*
    {
        "questionId":"someId",
        "answer":"1234",
        "datatype":"String 0r phone"
    }
    */

  let questionid = req.body.questionid;
  let answer = req.body.answer;
  let dataType = req.body.dataType;

  res.send(checkphone(answer));
});

exports.app = functions.https.onRequest(app);
exports.admin = functions.https.onRequest(api);

async function analyseMeaning(answer, mode) { //2 ระบบในฟังก์ชั่นเดียว #1 จากการ query ใน firestore, #2 จากการ request ไปยัง app engine
  return new Promise(async (resolve, reject) => {
    if(mode === 1){
      const meanings = await meaningLib.where("questionId", "==", answer.questionId).where("answer", "==", answer.answer).get()
      if(meanings.empty) resolve(null) //ไม่พบ meaning ใดใน MeaningLib หมายความว่าต้องให้ client ตอบอีกรอบ
      else resolve(meanings.docs[0].data()) //ต้องการแค่เฉพาะสมาชิกตัวแรกใน array จากการ query
    }else{
      const options = {
        url: 'https://covid19-test-a70c0.uc.r.appspot.com/api',
        body: answer,
        json: true,
        method: 'post'
      }
      request(options, (error, response, body) => {
        if (error) reject(error)
        else resolve(response.body)
      })
    }
  })
}

function checkPhoneMeaning(answer) {
  let meaning = {
    questionId: answer.questionId,
    answer: answer.answer,
    label: answer.answer,
    meaning: 0
  }

  if (isNaN(answer)) {
    const reg = /\d+/g;
    const result1 = answer.match(reg);
    const phone = String(result1[0] + result1[1] + result1[2])
    const length = result1[0].length + result1[1].length + result1[2].length
    const prefix = phone[0] + phone[1];
    if (prefix === '06' || prefix === '08' || prefix === '09') {
      if (length === 10) meaning.meaning = 1
      else meaning.meaning = 0
    } else if (prefix === '02' || prefix === '03' || prefix === '05' || prefix === '04' || prefix === '07') {
      if (length === 9) meaning.meaning = 1
      else meaning.meaning = 0
    }
  } else {
    const prefix = answer[0] + answer[1];
    if (prefix === "06" || prefix === "08" || prefix === "09") {
      if (answer.length === 10) meaning.meaning = 1
      else meaning.meaning = 0
    } else if (prefix === "02" || prefix === "03" || prefix === "05" || prefix === "04" || prefix === "07") {
      if (answer.length === 9) meaning.meaning = 1
      else meaning.meaning = 0
    }
  }

  return meaning
}

function analyseLabel(answer, meaning) {
  let label = ""

  switch(answer.questionId){
    case 'a102':
      if(meaning.meaning === 0) label = 'red'
      break
    case 'a103':
      if(meaning.meaning >= 1) label = 'red'
      break
    case 'a105':
      if(meaning.meaning >= 1) label = 'yellow'
      break
    case 'a106':
      if(meaning.meaning >= 1) label = 'yellow'
      break
    case 'a107':
      if(meaning.meaning === 0) label = 'yellow'
      else label = 'green' //เป็นคำถามสุดท้ายที่คัดกรองกลุ่ม สีเหลือง
      break
    case 'b100':
      if(meaning.meaning >= 1) label = 'covid'
      break
    case 'b101':
      if(meaning.meaning >= 1) label = 'covid'
      break
    default:
      label = meaning.label
  }

  return label
}
