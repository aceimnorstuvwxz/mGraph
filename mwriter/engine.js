
const jsonfile = require('jsonfile')
const request = require('request')
const path = require('path')
const electron = require('electron')
const { ipcMain, webContents, app, globalShortcut } = electron;
const sqlite3 = require('sqlite3').verbose()
const robot = require("robotjs")
let db;
const schedule = require('node-schedule')
const activeWin = require('active-win-lite')
const Store = require('electron-store')
const uuidv4 = require('uuid/v4')
const utils = require('./utils')
const fdc = require('./fdc')
const lite_notifier = require('electron-notifications-lite')

const TEST_LOCK = false;

const ALERT_SECONDS_WIN = 4 //win32
const TICK_STEP = 5 //最小的检查时间单位
const TICK_ENERGY = 5
const APP_USAGE_MAX = 8 //显示的app数量的最大值，多余的不显示
const ENERGY_PER_MINUTE_MAX = 100 //每分钟能量上线

const CONFIG_FILE_NAME = path.join(app.getPath('userData'), "raw_config.json")
const store = new Store() //更多的config持久化

let UUID;//每个客户端持续的标志，用来向服务器发数据时说明不同对象
let JUZI_ARRAY;

let last_cursor_pos_x = 0;
let last_cursor_pox_y = 0;

let last_minute_energy_sum = 0;
let last_minute_active_win_map = {};
let last_term_active_win_map = {};

let current_day_id = 0;
let current_day_active_win_map = {};
let current_non_active_cnt = 0; //不活动分钟数的计数，每次 出现活动时清零，出现不活动时累加，超过阈值后，算不持续工作了。
let current_day_ads_data = null;

// menu显示
let state_leatest_cost = 0;
let state_today_cost = 0;
let state_week_cost = 0;
let state_month_cost = 0;

// config
// 这里所配置的为默认配置
let CONFIG = {
    CFG_OVERFLOW_BEGIN: 45, //超过这个时间，提醒休息
    CFG_OVERFLOW_ALERT_SWITCH: true, //提醒的总开关
    CFG_OVERFLOW_MORE_ALERT: true,
    CFG_OVERFLOW_MORE_ALERT_INTERVAL: 15, //超时后，连续提醒的间隔
    CFG_AS_DOWN_BREAK_INTERVAL: 3, //超过这个时间的不活动，认为本latest strip断裂
}


//Exports
exports.init = init
exports.start = start

function init() {


    let fs = require('fs');
    let target_folder = app.getPath('userData')
    if (!fs.existsSync(target_folder)) { //在初始化db之前，确保那个文件夹建立了，否则db的创建会失败
        fs.mkdirSync(target_folder);
    }

    db = new sqlite3.Database(path.join(app.getPath('userData'), "diggtime.db")) //在userData文件夹被建立后在这里建db

    db.serialize(function () {
        // db.run('DROP TABLE if exists "minute_energy";')
        // db.run('DROP TABLE if exists "day_process_time";')
        db.run('CREATE TABLE if not exists "minute_energy" ("id" INTEGER NOT NULL,"energy" INTEGER,   "day_id" INTEGER,  PRIMARY KEY ("id") );')
        db.run('CREATE INDEX if not exists "main"."d" ON "minute_energy" ("day_id" ASC );')
        db.run('CREATE TABLE if not exists "day_process_time" ("id" INTEGER NOT NULL,"process_name" TEXT NOT NULL,"cost" INTEGER,PRIMARY KEY ("id", "process_name") );')
        console.log('database inited')
    })

    load_win_cost()
    load_statistics_state()
    load_cfg_data()
    load_juzi()

    try_init_autoboot()

    // chart fill->仅对spectrum有效
    if (!store.has('chart_fill')) {
        store.set('chart_fill', true) //默认不填色
    }

    // chart tension
    if (!store.has('chart_tension')) {
        store.set('chart_tension', false) //默认用直线
    }

    // uuid
    if (!store.has('uuid')) {
        store.set('uuid', uuidv4())
    }
    UUID = store.get('uuid')

    // lock
    if (!store.has('lock')) {
        store.set('lock', true)
    }

    if (TEST_LOCK) {
        store.set('lock', true) //开发测试用
    }


    // 键盘的活动认知
    init_keyboard_perceive()
}

function start() {

    let current = 2;
    while (current <= 59) {
        schedule.scheduleJob(current + ' * * * * *', tick_tock);
        current = current + TICK_STEP
    }

    // every minute
    schedule.scheduleJob('0 * * * * *', minute_tick_tock);

    // every SOME minute
    current = 0;
    while (current <= 59) {
        schedule.scheduleJob('10 ' + current + ' * * * *', big_tick_tock);
        current += 2
    }

    start_moving_count()
}


function put_energy(minute_id, energy, day_id) {
    db.serialize(function () {
        db.run(`INSERT INTO minute_energy(id, energy, day_id) VALUES(?, ?, ?)`, minute_id, energy, day_id, function (err) {
            if (err) {
                return console.log(err.message);
            }
            // get the last insert id
            console.log(`A row has been inserted with rowid ${this.lastID}`);
        });
    })
}

function get_spectrum_data(day_id) {
    db.serialize(function () {
        let sql = `SELECT  id, energy FROM minute_energy
        WHERE id >= ? and id < ?`;

        let id_begin = utils.day_id_2_minute_id(day_id)
        let id_end = utils.day_id_2_minute_id(day_id + 1)

        db.all(sql, [id_begin, id_end], (err, rows) => {
            if (err) {
                throw err;
            }

            notify_windows('spectrum_data', {
                rows: rows,
                chart_fill: store.get('chart_fill'),
                chart_tension: store.get('chart_tension')
            })
        })
    })
}

function get_appusage_data(day_id) {
    db.serialize(function () {
        let sql = `SELECT  id, process_name, cost FROM day_process_time
        WHERE id = ? ORDER BY cost DESC`;

        db.all(sql, [day_id], (err, rows) => {
            if (err) {
                throw err;
            }

            if (rows.length > APP_USAGE_MAX) {
                rows = rows.slice(0, APP_USAGE_MAX)
            }

            notify_windows('appusage_data', {
                rows: rows,
                lock: store.get('lock'),
                uuid: UUID
            })

        })
    })
}

function get_trend_data(start_day_id, end_day_id) {
    db.serialize(function () {
        let sql = `SELECT  day_id, count(id) as cost FROM minute_energy
        WHERE day_id >= ? and day_id <= ?  GROUP BY day_id ORDER BY day_id`;

        db.all(sql, [start_day_id, end_day_id], (err, rows) => {
            if (err) {
                throw err;
            }

            notify_windows('trend_data', {
                rows: rows,
                lock: store.get('lock'),
                uuid: UUID,
                chart_fill: store.get('chart_fill'),
                chart_tension: store.get('chart_tension')
            })
        })
    })
}


function load_cfg_data() {
    //从持久化，加载配置项目
    jsonfile.readFile(CONFIG_FILE_NAME, function (err, obj) {
        if (!err && obj != null) {
            console.dir(obj)
            CONFIG = obj
        } else {
            //default
            console.log('cfg not exist, use default')
        }
    })
}

function save_cfg_data() {
    jsonfile.writeFile(CONFIG_FILE_NAME, CONFIG, function (err) {
        console.log("save cfg")
        if (err) {
            console.error("save cfg error", err)
        }
    })
}

function load_win_cost() {
    //加载当前的win cost表
    current_day_id = utils.gen_day_id()
    db.serialize(function () {
        let sql = `SELECT  id, process_name, cost FROM day_process_time
                WHERE id = ?`;

        db.all(sql, [current_day_id], (err, rows) => {
            if (err) {
                throw err;
            }
            rows.forEach((row) => {
                current_day_active_win_map[row.process_name] = row.cost
            });
        })
    })
}



function update_win_cost(day_id, app_name, cost) {

    db.serialize(function () {

        let sql = `UPDATE day_process_time
        SET cost = ?
        WHERE id = ? and process_name = ?`;
        db.run(sql, [cost, day_id, app_name], function (err) {
            if (err) {
                return console.error(err.message);
            }

            console.log(`Row(s) updated: ${this.changes}`);
        });

    })
}

function insert_win_cost(day_id, app_name, cost) {
    db.serialize(function () {
        db.run(`INSERT INTO day_process_time(id, process_name, cost) VALUES(?, ?, ?)`, day_id, app_name, cost, function (err) {
            if (err) {
                return console.log(err.message);
            }
            // get the last insert id
            console.log(`A row has been inserted with rowid ${this.lastID}`);
        });
    })
}

function load_statistics_state() {
    //从数据库恢复计时

    //TODAY
    db.serialize(function () {
        let today_start_id = utils.day_id_2_minute_id(utils.gen_day_id())

        let sql = `SELECT count(id) cntd
            FROM minute_energy
            WHERE id >= ?`;

        // first row only
        db.get(sql, [today_start_id], (err, row) => {
            if (err) {
                return console.error(err.message);
            }

            if (row) {
                state_today_cost = row.cntd
                console.log('load today=', state_today_cost)
            }
        })
    })

    //week
    db.serialize(function () {
        let week_today = new Date().getDay()//注:0-6对应为星期日到星期六 

        let sun_day_id = utils.gen_day_id() - week_today //以周日为开始
        let start_minute_id = utils.day_id_2_minute_id(sun_day_id)


        let sql = `SELECT count(id) cntd
        FROM minute_energy
        WHERE id >= ?`;

        // first row only
        db.get(sql, [start_minute_id], (err, row) => {
            if (err) {
                return console.error(err.message);
            }

            if (row) {
                state_week_cost = row.cntd
                console.log('load week=', state_week_cost)
            }
        })
    })

    //month
    db.serialize(function () {
        let first_day_id = utils.gen_day_id() - new Date().getDate()
        let start_minute_id = utils.day_id_2_minute_id(first_day_id)

        let sql = `SELECT count(id) cntd
        FROM minute_energy
        WHERE id >= ?`;

        // first row only
        db.get(sql, [start_minute_id], (err, row) => {
            if (err) {
                return console.error(err.message);
            }

            if (row) {
                state_month_cost = row.cntd
                console.log('load month=', state_month_cost)
            }
        })
    })
}


let last_tick_tock_time = 0;
let win32_apppath_filedesc = {}
function tick_tock() {

    //node的定时体系，在电脑睡眠的时候会被暂停，到醒来的时候会把积累的立刻全部激发。以下代码来将此类错误的剔除。
    let current_tick_tock_time = new Date().getTime()
    if (Math.abs(current_tick_tock_time - last_tick_tock_time) < 500) {
        console.log('fake tick tock, ignore')
        return;
    }
    last_tick_tock_time = current_tick_tock_time

    //every seconds routine
    console.log(new Date().toLocaleTimeString(), 'tick_tock');

    let loc = electron.screen.getCursorScreenPoint()

    console.log("cursor loc:" + loc.x + '  ' + loc.y)

    if (loc.x == last_cursor_pos_x && loc.y == last_cursor_pox_y) {
        console.log("cursor retain")
    } else {
        last_minute_energy_sum += TICK_ENERGY
        console.log('cursor move')
        last_cursor_pos_x = loc.x
        last_cursor_pox_y = loc.y
    }

    // 键盘也以tick为单位认知
    if (last_tick_keyboard_stroke > 0) {
        last_tick_keyboard_stroke = 0
        last_minute_energy_sum += TICK_ENERGY
    }

    /*
    {
        title: 'npm install',
        id: 54,
        app: 'Terminal',
        pid: 368
    }
    */
    activeWin().then(result => {
        if (result.app == '') {
            console.log('empty app')
        } else {
            console.log(new Date().toLocaleTimeString(), result)

            let appName = result.app

            if (utils.is_win()) {
                if (result.app == "ApplicationFrameHost.exe") {
                    //UWP应用，并且对Edge特别处理一下
                    appName = "UWP application"
                    if (result.title.includes('Microsoft Edge')) {
                        appName = "Microsoft Edge"
                    }
                } else {
                    //win32 通过appPath和fdc获取文件的description来作为名字
                    if (result.appPath in win32_apppath_filedesc) {
                    } else {
                        let file_desc = fdc.get_file_desc(result.appPath)
                        //如果file desc是空的，则仍旧使用appName
                        win32_apppath_filedesc[result.appPath] = file_desc.length > 0 ? file_desc : appName
                    }
                    appName = win32_apppath_filedesc[result.appPath]
                }
            }

            console.log('AppName=', appName)
            if (appName in last_minute_active_win_map) {
                last_minute_active_win_map[appName] += TICK_STEP
            } else {
                last_minute_active_win_map[appName] = TICK_STEP
            }
        }

    });

}


Object.size = function (obj) {
    var size = 0, key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};

let last_minute_tick_tock_time = 0;
let fake_minute_tick_count = 0;
function minute_tick_tock() {

    //node的定时体系，在电脑睡眠的时候会被暂停，到醒来的时候会把积累的立刻全部激发。以下代码来将此类错误的剔除。
    let current_minute_tick_tock_time = new Date().getTime()
    if (Math.abs(current_minute_tick_tock_time - last_minute_tick_tock_time) < 500) {
        console.log('fake minute tick tock, ignore')
        //正确处理，使得如果主窗口正在显示今天的spectrum的时候，能够正确处理，同时能够启动break。
        notify_windows("last_minute_energy", { energy: 0 }) //用来当今天时append到spectrum
        state_leatest_cost = 0
        current_non_active_cnt += 1
        notify_all_update()

        fake_minute_tick_count += 1
        if (fake_minute_tick_count > 720){
            //当睡眠很久后，在 mac 上起来的时候会持续的 append 数据，当睡眠了几天后，请来这个过程会非常长
            app.relaunch()
            app.exit(0)
        }

        return;
    }
    last_minute_tick_tock_time = current_minute_tick_tock_time

    //Every minute check
    console.log('minute check:')
    console.log(last_minute_energy_sum)


    //把键盘的活动计算到energy中，改成按tick中是否有键盘
    // console.log('last keyboard stroke num=', last_minute_keyboard_stroke_energy)
    // last_minute_energy_sum += last_minute_keyboard_stroke_energy
    // last_minute_keyboard_stroke_energy = 0

    //窗口切换的能力增加
    if (Object.size(last_minute_active_win_map) > 1) {
        last_minute_energy_sum += TICK_STEP
    }

    //上限美化
    //超过60，offset只记录一半，这样在60处可以形成一定的平定，单又不绝对
    if (last_minute_energy_sum > 60) {
        last_minute_energy_sum = 60 + Math.floor((last_minute_energy_sum - 60) * 0.6 / 5) * 5
    }

    notify_windows("last_minute_energy", { energy: last_minute_energy_sum }) //用来当今天时append到spectrum

    if (last_minute_energy_sum > 0) {
        //只有此分钟有活动时，才能把此分钟的active win的计算进去。
        let key;
        for (key in last_minute_active_win_map) {
            if (key in last_term_active_win_map) {
                last_term_active_win_map[key] += last_minute_active_win_map[key]
            } else {
                last_term_active_win_map[key] = last_minute_active_win_map[key]
            }
        }

        //latest更新
        state_leatest_cost += 1
        state_today_cost += 1
        state_week_cost += 1
        state_month_cost += 1

        //不活动计数清零
        current_non_active_cnt = 0

    } else {
        //本分钟无活动
        current_non_active_cnt += 1
        console.log("non active")

        //检查隔断
        if (state_leatest_cost > 0 && current_non_active_cnt >= CONFIG.CFG_AS_DOWN_BREAK_INTERVAL) {
            state_leatest_cost = 0
            console.log("latest break")
        }
    }

    //存储数据
    if (last_minute_energy_sum > 0) {
        put_energy(utils.gen_minute_id(), last_minute_energy_sum, utils.gen_day_id())
        console.log('put energy')
    }


    //clear for next minute
    last_minute_energy_sum = 0
    last_minute_active_win_map = {}

    //检查新一天
    //不能只在0点检查，因为电脑会suspend，起来的时候可能是任何时候
    let new_day_id = utils.gen_day_id()
    if (current_day_id != new_day_id) {
        current_day_id = new_day_id
        current_day_active_win_map = {}
        state_today_cost = 0
        current_day_ads_data = null

        load_statistics_state() //为了重置bigsum数据
    }


    //告诉其它窗口更新
    notify_all_update()

    //超时提醒
    if (CONFIG.CFG_OVERFLOW_ALERT_SWITCH == true) {
        let offset = state_leatest_cost - CONFIG.CFG_OVERFLOW_BEGIN
        if (offset == -1 && current_day_ads_data == null) {
            load_ads_data()
        }
        let need_alert = false;
        if (offset == 0) {
            need_alert = true
        }
        if (offset > 0 && CONFIG.CFG_OVERFLOW_MORE_ALERT
            && offset % CONFIG.CFG_OVERFLOW_MORE_ALERT_INTERVAL == 0) {
            need_alert = true
        }
        if (need_alert) {
            make_alert()
        }
    }
}

function load_ads_data() {
    console.log("load ads data")
    request.get("http://adicons.boringuniverse.com/ad/d", {}, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log(body)
            current_day_ads_data = JSON.parse(body)
            console.log(current_day_ads_data.length)
        }
    })
}

function random_select(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

Array.prototype.remove = function (val) {
    var index = this.indexOf(val);
    if (index > -1) {
        this.splice(index, 1);
    }
};

function lg(cn, en) {
    return app.getLocale() == 'zh-CN' ? cn : en;
}

function get_alert_hm(mins){

    let h = Math.floor(mins/60)
    let m = mins - h * 60

    return (h > 0 ? `${h}${lg('小时',' hour')}`: '') + (m > 0 ? `${m}${lg('分钟', ' minutes')}` : '')
}

function make_alert() {
    name = "A.F.C"
    icon = null

    if (current_day_ads_data != null && current_day_ads_data.length > 0) {
        let selected = random_select(current_day_ads_data)
        current_day_ads_data.remove(selected)

        name = selected.name
        icon = selected.icon
    }
    title = `[${name}]${lg('提醒您', ' reminds you')}`

    content = lg(`连续工作了${get_alert_hm(state_leatest_cost)}`, `Has been working for ${get_alert_hm(state_leatest_cost)}`)

    if (utils.is_mac()) {
        //主线程是发不出的，发消息给menu窗口代行
        notify_windows("alert", { title: title, body: content, icon: icon })
    } else {
        //Windows下用electron-notifications-lite，它是基于窗口的，在主线程发
        lite_notifier.notify(title, {
            message: content,
            icon: path.join(__dirname, "images", "icon.png"),
            duration: ALERT_SECONDS_WIN * 1000,
            adicon: icon
        })
    }

}

let last_big_tick_tock_time = 0;
function big_tick_tock() {
    //清空，防止积累的 fake，也会导致 relaunch
    fake_minute_tick_count = 0


    //node的定时体系，在电脑睡眠的时候会被暂停，到醒来的时候会把积累的立刻全部激发。以下代码来将此类错误的剔除。
    let current_big_tick_tock_time = new Date().getTime()
    if (Math.abs(current_big_tick_tock_time - last_big_tick_tock_time) < 500) {
        console.log('fake big tick tock, ignore')
        return;
    }
    last_big_tick_tock_time = current_big_tick_tock_time

    console.log('big check:')
    console.log(last_term_active_win_map)

    //累加数据 & 存储数据
    for (key in last_term_active_win_map) {
        if (key in current_day_active_win_map) {
            current_day_active_win_map[key] += last_term_active_win_map[key]
            update_win_cost(current_day_id, key, current_day_active_win_map[key])
        } else {
            current_day_active_win_map[key] = last_term_active_win_map[key]
            insert_win_cost(current_day_id, key, current_day_active_win_map[key])
        }
    }

    last_term_active_win_map = {}
}

function notify_windows(msg_text, msg_data) {
    console.log('notify data to windows', msg_text)
    webContents.getAllWebContents().forEach(wc => {
        wc.send(msg_text, msg_data)
    })
}

function notify_all_update() {
    send_menu_data()
    send_latest_data()
    send_bigsum_data()
}

function send_menu_data() {
    notify_windows('menu_data_update', {
        latest: state_leatest_cost,
        today: state_today_cost
    })
}

function send_latest_data() {
    notify_windows('latest_data', {
        latest: state_leatest_cost,
        break_time: current_non_active_cnt,
        cfg_overflow: CONFIG.CFG_OVERFLOW_BEGIN,
        juzi: random_select(JUZI_ARRAY)
    })
}

ipcMain.on('refresh_latest_data', function (e, item) {
    //主窗口用户点击发射按钮后，更新一下最新的comment
    send_latest_data()
})

function send_bigsum_data() {
    notify_windows('bigsum_data', {
        today: state_today_cost,
        week: state_week_cost,
        month: state_month_cost
    })
}

ipcMain.on('request_menu_data', function (e, item) {
    console.log('request_update receive by main')
    send_menu_data()
})

ipcMain.on('request_latest', function (e, data) {
    send_latest_data()
})

ipcMain.on('request_bigsum', function (e, data) {
    send_bigsum_data()
})


ipcMain.on('get_spectrum_data', function (e, data) {
    console.log('get_spectrum_data of day = ' + data.day_id)

    get_spectrum_data(data.day_id)
})

ipcMain.on('get_appusage_data', function (e, data) {
    console.log('get_appusage_data,', data.day_id)

    check_auto_unlock()

    get_appusage_data(data.day_id)
})

ipcMain.on('get_trend_data', function (e, data) {
    console.log('get_trend_data', data.start_day_id, data.end_day_id)

    check_auto_unlock()

    get_trend_data(data.start_day_id, data.end_day_id)
})


// CONFIG
ipcMain.on('request_cfg_data', function (e, data) {
    console.log('request_cfg_data')

    notify_windows('cfg_data', [CONFIG, store.get('autoboot'), store.get('chart_fill'), store.get('chart_tension')])
})

ipcMain.on('cfg_update', function (e, data) {
    console.log('cfg_update', data)

    CONFIG = data;
    save_cfg_data()

})

// AUTOBOOT
function try_init_autoboot() {
    // 如果没有设置过，自动enable开机启动
    if (!store.has('autoboot')) {
        console.log('first time launch, set autoboot')
        store.set('autoboot', true)
        app.setLoginItemSettings({
            openAtLogin: true
        })
    }
}

ipcMain.on('set_autoboot', function (e, data) {
    console.log('set autoboot', data)
    app.setLoginItemSettings({
        openAtLogin: data
    })
    store.set('autoboot', data)
})

// Chart Fill
ipcMain.on('set_chart_fill', function (e, data) {
    console.log('set chart fill', data)
    store.set('chart_fill', data)

    //告诉主窗口，让他马上更新
    notify_windows("chart_fill_change", data)
})

ipcMain.on('set_chart_tension', function (e, data) {
    console.log('set chart tension', data)
    store.set('chart_tension', data)

    //告诉主窗口，让他马上更新
    notify_windows("chart_tension_change", data)
})

// MOVING COUNT 汇报

function start_moving_count() {

    const MOVING_COUNT_INTERVAL = 5 //每5分钟汇报一次

    let whichMin = Math.floor(Math.random() * MOVING_COUNT_INTERVAL)
    let whichSecond = Math.floor(Math.random() * 60)

    let rule = new schedule.RecurrenceRule();
    rule.second = whichSecond
    rule.minute = new schedule.Range(whichMin, 60, MOVING_COUNT_INTERVAL)
    console.log('count moving >>>', whichMin, whichSecond)

    schedule.scheduleJob(rule, moving_count_report_tick)
}

function moving_count_report_tick() {
    console.log('moving_count_report_tick')

    if (current_non_active_cnt < 5) {
        request.get(
            "http://adicons.boringuniverse.com/ct/w?s=" + UUID,
            {},
            function (error, response, body) { }
        )
    }
}

// SHARE
ipcMain.on('request_share_data', function (e, data) {
    db.serialize(function () {
        //以最近7天

        let start_day = utils.gen_day_id() - 7
        let sql = `SELECT process_name, SUM(cost) total_cost FROM day_process_time
        WHERE id >= ? GROUP BY process_name ORDER BY total_cost DESC`;

        let SHARE_APP_MAX = 10

        db.all(sql, [start_day], (err, rows) => {
            if (err) {
                throw err;
            }

            if (rows.length > SHARE_APP_MAX) {
                rows = rows.slice(0, SHARE_APP_MAX)
            }

            let data = {
                today: state_today_cost,
                week: state_week_cost,
                month: state_month_cost,
                app_usage: rows
            }
            notify_windows('share_data', data)
        })
    })

})

// LOCK
ipcMain.on('unlock', function (e, data) {
    console.log(">>>unlocking")

    //等几分钟后解锁
    setTimeout(function () {
        store.set('lock', false)
        console.log('>>>unlocked')
    }, Math.floor((3 + Math.random() * 3) * 60 * 1000))
})

ipcMain.on('check_lock', function (e, data) {
    notify_windows('check_lock_result', store.get('lock'))
})

function check_auto_unlock() {

    if (TEST_LOCK) return;

    if (store.get('lock')) {
        if (!store.has('lock_day')) {
            store.set('lock_day', utils.gen_day_id())
        }

        let lock_day = store.get('lock_day')
        if (utils.gen_day_id() - lock_day >= 3) {
            store.set('lock', false)
        }
    }
}

// 键盘的认知
// 一种不侵害用户隐私又能检测到键盘活动性的方法
let last_minute_keyboard_stroke_energy = 0
let last_tick_keyboard_stroke = 0


function init_keyboard_perceive() {

    const ret_enter = globalShortcut.register('enter', shortcut_callback_enter)

    if (!ret_enter) {
        console.log('[Error] global hotkey enter failed')
    }

    const ret_backspace = globalShortcut.register('backspace', shortcut_callback_backspace)

    if (!ret_backspace) {
        console.log('[Error] global hotkey backspace failed')
    }

    // 空格的截取会导致一些APP的收到影响，up/down也有可能有问题
    // globalShortcut.register('h', shortcut_callback_h)//会造成崩溃
    // globalShortcut.register('n', shortcut_callback_n)
    // globalShortcut.register(',', shortcut_callback_comma)
    // globalShortcut.register(';', shortcut_callback_fenhao)


    const ret_up = globalShortcut.register('up', shortcut_callback_up)

    if (!ret_up) {
        console.log('[Error] global hotkey up failed')
    }


    const ret_down = globalShortcut.register('down', shortcut_callback_down)

    if (!ret_down) {
        console.log('[Error] global hotkey down failed')
    }
}


function shortcut_callback_enter() {
    console.log('key enter')
    last_minute_keyboard_stroke_energy += 5
    last_tick_keyboard_stroke += 1
    globalShortcut.unregister('enter')
    robot.keyTap("enter")
    const ret = globalShortcut.register('enter', shortcut_callback_enter)
    if (!ret) {
        console.log('[Error] hotkey enter failed')
    }
}

function shortcut_callback_backspace() {
    console.log('key backspace')
    last_minute_keyboard_stroke_energy += 5
    last_tick_keyboard_stroke += 1
    globalShortcut.unregister('backspace')
    robot.keyTap("backspace")
    const ret = globalShortcut.register('backspace', shortcut_callback_backspace)
    if (!ret) {
        console.log('[Error] hotkey backspace failed')
    }
}


function shortcut_callback_up() {
    console.log('key up ')
    last_minute_keyboard_stroke_energy += 5
    last_tick_keyboard_stroke += 1
    globalShortcut.unregister('up')
    robot.keyTap("up")
    const ret = globalShortcut.register('up', shortcut_callback_up)
    if (!ret) {
        console.log('[Error] hotkey up failed')
    }
}


function shortcut_callback_down() {
    console.log('down enter')
    last_minute_keyboard_stroke_energy += 5
    last_tick_keyboard_stroke += 1
    globalShortcut.unregister('down')
    robot.keyTap("down")
    const ret = globalShortcut.register('down', shortcut_callback_down)
    if (!ret) {
        console.log('[Error] hotkey down failed')
    }
}

// 句子
function load_juzi() {

    jsonfile.readFile(path.join(__dirname, "juzi.json"), function (err, obj) {
        if (!err && obj != null) {
            JUZI_ARRAY = obj['RECORDS']
            console.log('juzi length', JUZI_ARRAY.length)
        } else {
            //default
            console.log('juzi.json not exist, use default')
        }
    })
}