var htmlToText = require('html-to-text');
const path = require('path')
const rmmd = require('./rmmd')
const count = require('word-count')

function test_text(){
    htmlToText.fromFile(path.join(__dirname, '../testdata/facebook.html'), {
        tables: ['#invoice', '.address']
      }, (err, text) => {
        if (err) return console.error(err);
        console.log(text);
      });
}


function test_markdown(){
    var md1 = html2md.html2mdFromString("<h1>Hello!</h1>");

    // https or http, not isomorphic
    html2md.html2mdFromURL("https://hot.cnbeta.com/articles/movie/710435", "body").then(console.log);
}


function test_rmmd(){
    let md = '`code` i am here'

    let rmd = rmmd.rmmd(md)
    console.log(rmd)
    console.log(rmd.split(rmmd.sp).join(''))
}

function test_wc(){

    console.log(count('hello world 你好世界'))
    console.log(count('你好世界'))

}

test_wc()