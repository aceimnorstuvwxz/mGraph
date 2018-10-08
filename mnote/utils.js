// (C)2018 netqon.com all rights reserved.
const electron = require('electron')
const path = require('path')

exports.is_dev = true //是否打开开发调试
exports.is_mas = false //是否是给mas编译

let g_is_cn = (electron.app ? electron.app.getLocale() : electron.remote.app.getLocale()) == 'zh-CN'

exports.is_cn = g_is_cn
exports.lg = (cn, en) => {
    return g_is_cn ? cn : en
}

function version_string_2_code(ver) {
    //x.x.x
    let arr = ver.split('.')
    arr = arr.map(x => parseInt(x))
    let sum = 10000 * arr[0] + 100 * arr[1] + 1 * arr[2]
    return sum
}

function is_mac() {
    return process.platform == 'darwin'
}

function is_win() {
    return !is_mac()
}


function random_select(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

exports.version_string_2_code = version_string_2_code
exports.is_win = is_win
exports.is_mac = is_mac
exports.random_select = random_select

exports.len = function (text) {
    return Buffer.byteLength(text, 'utf8')
}

exports.mmss = (secs) => {
    secs = Math.floor(secs)
    let minutes = Math.floor(secs / 60);
    secs = secs % 60;
    return '' + minutes + ":" + pad(secs)
}

exports.get_userData = () => {
    return electron.app ? electron.app.getPath('userData') : electron.remote.app.getPath('userData')
}

exports.safe_json_parse = (text) => {
    r = {}
    try {
        r = JSON.parse(text)
    } catch (e) {
    }
    r = r ? r : {}
    return r
}

exports.get_embedded_url = () => {
    return 'http://mnote.netqon.com/embedded.html?t=' + Date.now() + `&lan=${g_is_cn ? 'zh' : 'en'}`
}

exports.get_file_ext = (p) => {
    let t = p.split('.').pop()
    t = t.split('#')[0]//remove hash
    t = t.split('?')[0] //remove query part
    return t.toLowerCase()
}

exports.get_product_site_url = () => {
    return 'http://mnote.netqon.com?ref=mnote'
}
