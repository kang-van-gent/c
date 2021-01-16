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
  let result = Result();
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
  let qid = req.query.questionId;
  let dataType = req.body.dataType;
  let answer = req.body.answer;
  let emergId = req.body.emergencyId
  let patientId = req.body.patientId
  let repeatCount = req.body.repeatCount
  let suggestCount = req.body.suggestCount

  let order = {
    nextTo: "",
    isRepeat: false,
    label:"",
    suggestMeaning:""
  };

  let answerData = {
    questionId: qid,
    answer: answer,
    dataType: dataType,
    date: new Date(),
    emergencyId: emergId,
    patientId: patientId,
    repeatCount:repeatCount,
    suggestCount: suggestCount

  };

  let meaning = {
    questionId: "",
    answer: "",
    meaning: "",
    label: ""
  };

  try{
    if(qid === 'a106')
    {
      const qd = (await questionsLib.doc(qid).get()).data();
      meaning = {
        questionId: qid,
        answer: answerData.answer,
        meaning:1
      }

      order = {
        nextTo: qd['nextTo' + meaning.meaning],
        isRepeat: false,
        // getLabel ส่งค่าสีกลับไปด้วย
        label: "answerDetails"
      }

      res.send(order);

    } else {
      if (dataType === "Phone") 
      {
        let tel = checkphone(answer);
        const qd = (await questionsLib.doc(qid).get()).data();

        if (tel.isPhone === true) 
        {
          meaning = {
            questionId: qid,
            answer: answer,
            meaning: "1",
            label: "1"
          };

        } else {
          meaning = {
            questionId: qid,
            answer: answer,
            meaning: "0",
            label: "0"
          };
        }

        order = {
          nextTo: qd['nextTo' + meaning.meaning],
          isRepeat: false,
          // getLabel ส่งค่าสีกลับไปด้วย
          label:"Phone"
        };
        res.send(order);

      } else {
        //const ml = (await meaningLib.doc(qid).get()).data();
        const qd = (await questionsLib.doc(qid).get()).data();
        meaning = await getMeaning(answerData);

        if(dataType === 'Number'){ /// แก้ทีหลัง เมื่อทำฟีเจอร์ถามผู้ป่วยมากกว่า 1 ราย
          let re_mean = 0;

          if(meaning.meaning === 1) re_mean = 1; //ถ้า ไม่ใช่ 1 คนให้โอนสายไปหาเจ้าหน้าที่เลยก่อน

          order = {
            nextTo: qd['nextTo' + re_mean],
            isRepeat: false,
            // getLabel ส่งค่าสีกลับไปด้วย
            label:"Numbers of patient"
          };

        } else {
          // query หา data ใน meaningLib 
          const snapshot = await meaningLib.where("questionId","==",answerData.questionId).where("answer","==",answerData.answer).get();
          
          if(snapshot.empty){//ถ้าไม่มี ส่ง order ให้ถามอีกรอบ
            order = {
              nextTo: qd['nextTo' + meaning.meaning],
              isRepeat: true,
              // getLabel ส่งค่าสีกลับไปด้วย
              label:"Ask again"
            };

          }else{//ถ้ามี บันทึก answer ลงในฐานข้อมูล Answer
            answerRef.doc().set(answerData);
            order = {
              nextTo: qd['nextTo' + snapshot.meaning],
              isRepeat: false,
              // getLabel ส่งค่าสีกลับไปด้วย
              label: snapshot.label
            };
          }

          if (answerData.repeatCount>=1) {// ถ้า repeatCount >= 1 ให้ AI หา Meaning
            meaning = await getMeaning(answerData);
            order ={
              nextTo: qd['nextTo' + meaning.meaning],
              isRepeat:false,
              // getLabel ส่งค่าสีกลับไปด้วย
              label:meaning.label
            }
          }
          res.send(order);
        }
      }
    }
  }catch (err) {
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

var Result = function () {
  return {
    success: false,
    response: null,
    error: null,
  };
};

var Error = function (code, msg) {
  return {
    code: code,
    msg: msg,
  };
};

var getMeaning = function (answer) {
    return new Promise((resolve, reject)=>{
        var options = {
            url: 'https://covid19-test-a70c0.uc.r.appspot.com/api',
            body: answer,
            json: true,
            method: 'post'}
        
            request(options, (error, response, body) => {
                if(error){
                    reject(error)
                }else{
                    let set = response.body
                    resolve(set)
                }
            });
    })
}

function checkphone(answer) {
  let result = {
    isPhone: false,
    prefix: "",
    length: 0,
  };

  if (isNaN(answer)===false) {
    let prefix = answer[0] + answer[1];
    if (prefix === "06" || prefix === "08" || prefix === "09") {
      if (answer.length === 10) {
        result.isPhone = true;
      } else {
        result.isPhone = false;
      }
    } else if (prefix === "02" ||prefix === "03" ||prefix === "05" ||prefix === "04" ||prefix === "07") {
      if (answer.length === 9) {
        result.isPhone = true;
      } else {
        result.isPhone = false;
      }
    } else {
      result.isPhone = false;
    }
    result.prefix = prefix;
    result.length = answer.length;

  } else{
    let reg = /\d+/g;
    let result1 = answer.match(reg);
    let phone = String(result1[0]+result1[1]+result1[2])
    let length = result1[0].length+result1[1].length+result1[2].length
    let prefix = phone[0] + phone[1];
    if (prefix === '06' || prefix === '08' || prefix === '09') {
      if (length === 10) {
        result.isPhone = true;
      } else {
        result.isPhone = false;
      }
    } else if (prefix === '02' ||prefix === '03' ||prefix === '05' ||prefix === '04' ||prefix === '07') {
      if (length === 9) {
        result.isPhone = true;
      } else {
        result.isPhone = false;
      }
    } else {
      result.isPhone = false;
    }
    result.prefix = prefix;
    result.length = length;

  }

  return result;
}

function getLabel(answerData){
  let label = "";
  if(answerData.questionId==='a102'||answerData.questionId==='a103') label='red';
  if(answerData.questionId==='a104'||answerData.questionId==='a105'||answerData.questionId==='a106'||answerData.questionId==='a107') label ='yellow';
  if(answerData.questionId==='b100'||answerData.questionId==='b101') label='covid';
}
