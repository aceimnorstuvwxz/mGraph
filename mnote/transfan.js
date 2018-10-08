//All translation ApI
const request = require('superagent');

/*

{  
   "errorCode":0,
   "detect":{  
      "zly":"zly",
      "is_cache":true,
      "detect":"en",
      "errorCode":"0",
      "language":"英语",
      "id":"68c0bac1-0d32-44df-9286-ffd639719b4f",
      "text":"Hello world!"
   },
   "message":"Success",
   "translate":{  
      "qc_type":"1",
      "zly":"zly",
      "is_cache":true,
      "errorCode":"0",
      "index":"content0",
      "source":"sogou",
      "dit":"你好世界！",
      "from":"en",
      "text":"Hello world!",
      "to":"zh-CHS",
      "id":"68c0bac1-0d32-44df-9286-ffd639719b4f",
      "orig_text":"Hello world!",
      "md5":""
   },
   "isHasOxford":false,
   "isHasChinese":false
}
*/

/* sogou */
exports.translate2cn = function (text, cb) {
    // call cb with null, if error
    if (text.length >= 5000) {
        console.log('[transfan] may too long text', text.length)
    }
    request.post('https://fanyi.sogou.com/reventondc/translate')
        .type('form') // in x-www-form-urlencoded mode
        .send({
            text: text
        }).end((err, res) => {
            let trs = null
            if (err) {
                console.log('transfan, error', err)
            } else {
                console.log(res.status)
                console.log(res.text)
                console.log(res.body)
                if (res.status == 200) {
                    let ret = JSON.parse(res.text)
                    if (ret.errorCode == '0' && ret.detect.errorCode == '0' && ret.translate.errorCode == '0') {
                        trs = {
                            from_text: text,
                            from_type: ret.translate.from,
                            to_text: ret.translate.dit,
                            to_type: ret.translate.to
                        }
                    }
                }
            }
            if (cb) cb(trs)
        })
}

let count = 0

function log(ret) {
    console.log(ret, count++)
}

function sogo_test() {
    let t = [
        'あなたは本当に私を愛していますか？',
        "fuck you!!! stupid asshole!!",
        "狗日的",
        "乐"
    ]
    setInterval(function () {
        t.forEach(function (v) {
            exports.translate2cn(v, log)
        })
    }, 100)
}

/*
detection is applyed, if origin is Zh-cn, then to "en" always.
test with 100ms *3, in 1w round, above, no baning happens?
*/
// sogo_test()

