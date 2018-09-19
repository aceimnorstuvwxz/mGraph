const sqlite3 = require('sqlite3').verbose()
const electron = require('electron')
const { app, BrowserWindow, Menu, ipcMain, globalShortcut, crashReporter } = electron;
const utils = require('./utils')
const uuidgen = require('uuid/v4');
const main_utils = require('./main_utils')
const Store = require('electron-store')
const request = require('superagent');
const store = new Store()
const gdiff = require('diff-match-patch')
const jsonfile = require('jsonfile')
const getFavicons = require('get-favicons')
const { URL } = require('url')
const htmlToText = require('html-to-text');
const fs = require('fs')
const linkway = require('./linkway')
const deepdiff = require('deep-diff')

let g_db = null

/* config */
let g_config_cache = null

g_config_cache = store.get('config', {
  notify_change: true,
  notify_exception: true,
  notify_recovery: true,
  check_interval: 'B',
  launch_at_login: true
})

app.setLoginItemSettings({
  openAtLogin: g_config_cache.launch_at_login
})

/* Single instance */
if (utils.is_win()) {
  if (app.makeSingleInstance(single_instance_callback)) {
    //第二个进程，直接退出
    console.log('second instance, quit imediately')
    app.exit(0)
  }
}

function single_instance_callback(argv, workdir) {
  //另一个进程想要启动，直接打开单粒的主窗口
  console.log("second instance try to open, open raw instance's main windows instead")
  createMainWindow()
}

const path = require('path')
const url = require('url')

console.log('userData=', app.getPath('userData'))

/* app */

app.on('ready', function () {

  database_init()
  // monitor_init()

  createMainWindow()//启动后，并不打开主窗口

  const menu = Menu.buildFromTemplate(get_menu_template())
  Menu.setApplicationMenu(menu)
})

app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createMainWindow() //点击dock的图标，能够打开主窗口
  }
})

app.on('will-quit', () => {
  // Unregister all shortcuts.
  globalShortcut.unregisterAll()
})


/* menu */
function lg(cn, en) {
  return app.getLocale() == 'zh-CN' ? cn : en;
}

function get_menu_template() {
  //locale在app ready之前，无法返回正确的值

  const menuTemplate = [
    {
      label: lg('文件', 'File'),
      submenu: [
        {
          label: lg('新文集', 'New Collection'),
          // accelerator: 'CmdOrCtrl+N',
          click() {
            main_utils.notify_all_windows('cmd-new-target')
          }
        },
        {
          label: lg('新文章', 'New Article'),
          accelerator: 'CmdOrCtrl+N',
          click() {
            main_utils.notify_all_windows('cmd-new-record')
          }
        },
        {
          label: lg('保存', 'Save'),
          accelerator: 'CmdOrCtrl+S',
          click() {
            main_utils.notify_all_windows('cmd-save')
          }
        }
      ]
    },
    {
      label: lg('编辑', 'Edit'),
      submenu: [
        { role: 'undo', label: lg('撤销', 'Undo') },
        { role: 'redo', label: lg('恢复', 'Redo') },
        { type: 'separator' },
        { role: 'cut', label: lg('剪切', 'Cut') },
        { role: 'copy', label: lg('复制', 'Copy') },
        { role: 'paste', label: lg('粘贴', 'Paste') },
        { role: 'selectall', label: lg('全选', 'Select All') }
      ]
    },
    {
      label: lg('查看', 'View'),
      submenu: [
        { role: 'zoomin', label: lg('放大', 'Zoom In') },
        { role: 'zoomout', label: lg('缩小', 'Zoom Out') },
        { role: 'resetzoom', label: lg('重置缩放', 'Reset Zoom') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: lg('切换全屏', 'Toggle Fun Screen') },
        { label: 'Toggle Preview', accelerator: 'CommandOrControl+p',
          click(){  main_utils.notify_all_windows('cmd-toggle-preview') }}
      ]
    },
    {
      role: 'window',
      label: lg('窗口', 'Window'),
      submenu: [
        { role: 'minimize', label: lg('最小化', 'Minimize') },
        { role: 'close', label: lg('关闭', 'Close') }
      ]
    },
    {
      role: 'help',
      label: lg('帮助', 'Help'),
      submenu: [
        {
          label: lg('反馈', 'Feedback'),
          click() { require('electron').shell.openExternal('http://m4j0r.com/articles/19') }
        },
        {
          label: lg('检查更新', "Check for updates"),
          click() { openCheckUpdateWindow() }
        },
        { type: 'separator' },
        {
          label: lg('了解更多', 'Learn More'),
          click() { require('electron').shell.openExternal('http://afcapp.boringuniverse.com') }
        }
      ]
    }
  ]


  if (utils.is_mac()) {
    menuTemplate.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about', label: lg('关于 Langedit', 'About Langedit') },
        { type: 'separator' },
        {
          label: lg('偏好设置', 'Preferences'),
          accelerator: 'CommandOrControl+,',
          click() { createSettingWindow() }
        },
        { role: 'services', label: lg('服务', 'Services'), submenu: [] },
        { type: 'separator' },
        { role: 'hide', label: lg('隐藏 Langedit', 'Hide Langedit') },
        { role: 'hideothers', label: lg('隐藏其它', 'Hide Others') },
        { role: 'unhide', label: lg('显示全部', 'Show All') },
        { type: 'separator' },
        { role: 'quit', lable: lg('退出', 'Quit') }
      ]
    })

    // mac's Window menu
    menuTemplate[4].submenu = [
      { role: 'close', label: lg('关闭', 'Close') },
      { role: 'minimize', label: lg('最小化', 'Minimize') },
      { role: 'zoom', label: lg('缩放', 'Zoom') },
      { type: 'separator' },
      { role: 'front', label: lg('全部置于顶层', 'Bring All to Front') }
    ]
  } else {
    //For Win32, add settings and Exit
    menuTemplate[0].submenu.push(
      {
        label: lg('设置', 'Settings'),
        click() { createSettingWindow() },
        accelerator: 'Ctrl+,'

      }
    )

    menuTemplate[0].submenu.push(
      { type: 'separator' }
    )
    menuTemplate[0].submenu.push(
      {
        role: 'quit',
        label: lg('退出', 'Exit'),
        accelerator: 'Ctrl+q'
      }
    )

    menuTemplate[4].submenu.unshift(
      {
        role: 'about',
        label: lg('关于 Langedit', 'About Langedit'),
        click() { openAboutWindow() }
      }
    )
  }

  if (utils.is_dev()) {
    menuTemplate.push({
      label: 'Dev',
      submenu: [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },
        {
          label: 'test crash',
          click() { process.crash() }
        },
        {
          label: 'relaunch',
          click() {
            app.relaunch()
            app.exit(0)
          }
        },
        {
          label: 'devwin',
          click(){
            openDevWindow()
          }
        }
      ]
    })
  }

  return menuTemplate
}

// ---------- Main Window ---------

let mainWindow

function createMainWindow() {
  if (mainWindow == null) {

    mainWindow = new BrowserWindow({
      webPreferences: { webSecurity: false }, //关闭同源检查，为了ad页面可以调用electron来在外部浏览器打开url
      width: store.get('width', 1400),
      height: store.get('height', 600),
      titleBarStyle: 'hidden'
    })

    mainWindow.loadURL(url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true
    }))

    mainWindow.webContents.on('new-window', function (event, url) {
      event.preventDefault();
      electron.shell.openExternal(url)
    })

    // mainWindow.openDevTools()

    mainWindow.on('closed', function () {
      mainWindow = null
    })

  } else {
    mainWindow.show()
  }


}

ipcMain.on('open-main-window', function (e, data) {
  createMainWindow()
})

//----------Settings window --------

let settingWindow

function createSettingWindow() {
  if (settingWindow != null) {
    settingWindow.show()
  } else {
    settingWindow = new BrowserWindow({
      webPreferences: { webSecurity: false },
      width: 300,
      height: utils.is_win() ? 540 : 520
    })

    settingWindow.loadURL(url.format({
      pathname: path.join(__dirname, 'settings.html'),
      protocol: 'file:',
      slashes: true
    }))

    settingWindow.setResizable(true)
    if (utils.is_win()) {
      // No menu for win in setting
      settingWindow.setMenu(null)
    }

    settingWindow.on('closed', function () {
      settingWindow = null
    })
  }
}


ipcMain.on('open-settings', function (e, data) {
  createSettingWindow()
})

const g_interval_map = {
  X: 1,
  A: 5,
  B: 15,
  C: 30,
  D: 60,
  E: 120,
  F: 4 * 60,
  G: 6 * 60,
  H: 12 * 60,
  I: 24 * 60
}

ipcMain.on('get-settings-data', function (e, data) {
  main_utils.notify_all_windows('settings-data', g_config_cache)
})

ipcMain.on('update-settings', function (e, data) {
  console.log(data)

  let old_check_interval = g_config_cache.check_interval

  g_config_cache = data
  store.set('config', g_config_cache)

  app.setLoginItemSettings({
    openAtLogin: g_config_cache.launch_at_login
  })

  if (old_check_interval != g_config_cache.check_interval) {
    monitor_reset_main_timer()
  }

  main_utils.notify_all_windows('update-config', g_config_cache)

})

ipcMain.on('get-config', function (e, data) {
  main_utils.notify_all_windows('update-config', g_config_cache)
})

/* share */
let shareWindow

function createShareWindow() {

  shareWindow = new BrowserWindow({
    webPreferences: { webSecurity: false },
    width: 300,
    height: utils.is_win() ? 530 : 500
  })

  shareWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'share.html'),
    protocol: 'file:',
    slashes: true
  }))

  shareWindow.setResizable(true)
  if (utils.is_win()) {
    //No menu for windows in share win
    shareWindow.setMenu(null)
  }

  shareWindow.on('closed', function () {
    shareWindow = null
  })

}
ipcMain.on('open_share', function (e) {
  if (shareWindow == null) {
    createShareWindow()
  } else {
    shareWindow.show()
  }
})


// UPDATE
let checkUpdateWindow;

function openCheckUpdateWindow() {
  if (checkUpdateWindow != null) {
    checkUpdateWindow.show()
  } else {
    checkUpdateWindow = new BrowserWindow({
      webPreferences: { webSecurity: false },
      width: 300,
      height: 500
    })

    checkUpdateWindow.loadURL(url.format({
      pathname: path.join(__dirname, 'update.html'),
      protocol: 'file:',
      slashes: true
    }))

    checkUpdateWindow.setResizable(true)
    if (utils.is_win()) {
      // no menu for checkupdate win in windows
      checkUpdateWindow.setMenu(null)
    }

    checkUpdateWindow.on('closed', function () {
      checkUpdateWindow = null
    })
  }


}

ipcMain.on('open_update', function (e) {
  openCheckUpdateWindow()
})


/* CRASH REPORT */
crashReporter.start({
  productName: 'Langedit',
  companyName: 'boringuniverse.com',
  submitURL: 'http://breakpad.m4j0r.com:443/post',
  uploadToServer: true
})

console.log("crash reporter init")
ipcMain.on('crash', function (e) {
  console.log('crash report test')
  process.crash()
})

/* Dev win */
let devWindow;//win32

function openDevWindow() {
  if (aboutWindow != null) {
    devWindow.show()
  } else {
    devWindow = new BrowserWindow({
      webPreferences: { webSecurity: false },
      width: 800,
      height: 600
    })

    devWindow.loadURL(url.format({
      pathname: path.join(__dirname, 'dev.html'),
      protocol: 'file:',
      slashes: true
    }))
    devWindow.openDevTools()

    devWindow.setResizable(true)
    if (utils.is_win()) {
      // no menu for checkupdate win in windows
      devWindow.setMenu(null)
    }

    devWindow.on('closed', function () {
      devWindow = null
    })
  }

}

/* ABOUT */
let aboutWindow;//win32

function openAboutWindow() {
  if (aboutWindow != null) {
    aboutWindow.show()
  } else {
    aboutWindow = new BrowserWindow({
      webPreferences: { webSecurity: false },
      width: 300,
      height: 500
    })

    aboutWindow.loadURL(url.format({
      pathname: path.join(__dirname, 'about.html'),
      protocol: 'file:',
      slashes: true
    }))

    aboutWindow.setResizable(true)
    if (utils.is_win()) {
      // no menu for checkupdate win in windows
      aboutWindow.setMenu(null)
    }

    aboutWindow.on('closed', function () {
      aboutWindow = null
    })
  }

}

// Win32，点击notification打开主窗口
ipcMain.on('notification-lite-click', function (e) {
  console.log('lite to open main window')
  createMainWindow()
})

/* database */

let g_target_sql = `
CREATE TABLE if not exists "target" (
  "id" text,
  "address" text,
  "name" text,
  "state" integer,
  "topindex" integer,
  "icon" text,
  "min_change" integer,
  "min_text_line" integer,
  "read" integer,
  "muted" integer,
  "way" integer DEFAULT 0,
  "added_only" integer DEFAULT 0
);`
let g_record_sql = `
CREATE TABLE if not exists "record" (
  "id" text,
  "target_id" text,
  "html" text,
  "read" integer,
  "flag" integer,
  "time" integer,
  "number" integer,
  "state" integer,
  "status" text,
  "added" integer,
  "deleted" integer,
  "diff" text
);`

let g_record_index_sql = `CREATE INDEX "main"."record-number"
ON "record" (
  "number" COLLATE BINARY DESC
);`

function database_init() {
  store.set('dbversion', '1')

  g_db = new sqlite3.Database(path.join(electron.app.getPath('userData'), "database.db"))

  g_db.serialize(function () {
    // g_db.run(g_target_sql)
    // g_db.run(g_record_sql)
  })

  if (!store.get('db_inited', false)) {
    // g_db.serialize(function () { //TODO index if necessary
    // g_db.run(g_record_index_sql)
    // })

    //TODO add example data

    console.log('database inited')
    store.set('db_inited', true)
  }

}


function db_get_all_targets(cb) {
  g_db.serialize(function () {
    let sql = `SELECT  id, name, address,  icon, position FROM target`;

    g_db.all(sql, (err, rows) => {
      if (err) {
        throw err;
      }
      if (cb) {
        cb(rows)
      }
    })
  })
}

function db_get_target_by_id(target_id, cb) {
  g_db.serialize(function () {
    let sql = `SELECT  id, name, address,  icon, position FROM target WHERE id=?`;

    g_db.all(sql, [target_id], (err, rows) => {
      if (err) {
        throw err;
      }

      if (rows.length != 1) {
        console.error('ERROR not find target', target_id)
      } else {
        if (cb) {
          cb(rows[0])
        }
      }

    })
  })
}

function db_remove_target(target_id) {
  g_db.serialize(function () {
    g_db.run(`DELETE FROM target WHERE id=?`,
      [target_id], function (err) {
        if (err) {
          return console.log(err.message)
        }
        console.log(`A row has been deleted with rowid ${this.lastID}`)
      })
  })
}

function db_remove_record(record_id) {
  g_db.serialize(function () {
    g_db.run(`DELETE FROM record WHERE id=?`,
      [record_id], function (err) {
        if (err) {
          return console.log(err.message)
        }
        console.log(`A row has been deleted with rowid ${this.lastID}`)
      })
  })
}

function db_save_new_target(new_target) {

  g_db.serialize(function () {
    g_db.run(`INSERT INTO target(id, name, address, icon, position) VALUES(?, ?, ?, ?, ?)`,
      new_target.id, new_target.name, new_target.address, new_target.icon, new_target.position, function (err) {
        if (err) {
          return console.log(err.message)
        }
        console.log(`A row has been inserted with rowid ${this.lastID}`)
      })
  })
}

function db_add_target_topindex(target) {

}

function db_set_target_state(target_id, new_state) {

}


function db_set_target_read(target_id, read) {

}

function db_set_target_muted(target_id, muted) {

}

function db_set_target_icon(target_id, new_icon) {
  g_db.serialize(function () {
    g_db.run(`UPDATE target set icon=? WHERE id=?`,
      [new_icon, target_id], function (err) {
        if (err) {
          return console.log(err.message)
        }
        console.log(`A row has been updated with rowid ${this.lastID}`)
      })
  })
}

function db_update_target_config(target_id, name, address) {
  g_db.serialize(function () {
    g_db.run(`UPDATE target set name=?, address=? WHERE id=?`,
      [name, address, target_id], function (err) {
        if (err) {
          return console.log(err.message)
        }
        console.log(`A row has been updated with rowid ${this.lastID}`)
      })
  })
}


function db_set_record_read(record_id) {

  g_db.serialize(function () {
    g_db.run(`UPDATE record SET read=1 WHERE id=?`, [record_id],
      function (err) {
        if (err) {
          throw err
          return console.error(err.message);
        }
        console.log(`A row has been updated with rowid ${this.lastID}`);
      })
  })

}

function db_update_record_data(record) {
  g_db.serialize(function () {
    g_db.run(`UPDATE record SET src_title=?, des_title=?, note=?, src_text=?, des_text=?, edit_time=?, src_address=?, des_address=?, image=?, src_desc=?, des_desc=? WHERE id=?`, 
    [record.src_title, record.des_title, record.note, record.src_text, record.des_text, record.edit_time, record.src_address, record.des_address, record.image, record.src_desc, record.des_desc, record.id],
      function (err) {
        if (err) {
          throw err
          return console.error(err.message);
        }
        console.log(`A row has been updated with rowid ${this.lastID}`);
      })
  })
}

function db_mark_all_read(target_id) {

  g_db.serialize(function () {
    g_db.run(`UPDATE record SET read=1 WHERE target_id=? and read=0`, [target_id],
      function (err) {
        if (err) {
          return console.error(err.message);
        }
      })
  })
}

function db_delete_records(target_id) {
  g_db.serialize(function () {
    g_db.run(`DELETE FROM record  WHERE target_id=?`, [target_id],
      function (err) {
        if (err) {
          return console.error(err.message);
        }
      })
  })
}

function db_get_some_records(target_id, offset, cb) { //support different ORDER
  console.log('offset', offset)
  g_db.serialize(function () {/* no detail data*/
    let sql = `SELECT  id, target_id, src_title, des_title, image, note, src_desc, des_desc, create_time, edit_time FROM record WHERE target_id=? ORDER BY create_time DESC LIMIT ? OFFSET ? `;
    g_db.all(sql, [target_id, 20, offset], (err, rows) => {
      if (err) {
        throw err;
      }
      if (cb) {
        cb(rows)
      }
    })
  })
}

function db_save_new_record(new_record) {

  g_db.serialize(function () {
    g_db.run(`INSERT INTO record(id, target_id, src_title, des_title, image, note, src_address, des_address, src_text, des_text, create_time, edit_time, src_desc, des_desc) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      new_record.id, new_record.target_id, new_record.src_title, new_record.des_title, new_record.image, new_record.note,
      new_record.src_address, new_record.des_address, new_record.src_text, new_record.des_text, new_record.create_time, new_record.edit_time, new_record.src_desc, new_record.des_desc,
      function (err) {
        if (err) {
          return console.error(err.message);
        }
        console.log(`A row has been inserted with rowid ${this.lastID}`);
      });
  })
}

function db_get_record(record_id, cb) {
  g_db.serialize(function () {
    let sql = `SELECT  id, target_id, src_title, des_title, image, note, src_address, des_address, src_text, des_text, create_time, edit_time, src_desc, des_desc FROM record WHERE id=? `;
    g_db.all(sql, [record_id], (err, rows) => {
      if (err) {
        throw err;
      }
      if (cb) {
        if (rows && rows.length > 0) {
          cb(rows[0])
        }
      }
    })
  })
}


function db_get_last_record(target_id, cb) {
  g_db.serialize(function () { //, added, deleted, diff not needed
    let sql = `SELECT  id, target_id, html, read, flag, time, number, state, status FROM record WHERE target_id=? ORDER BY number DESC LIMIT 1`;
    g_db.all(sql, [target_id], (err, rows) => {
      if (err) {
        throw err;
      }
      if (cb) {
        cb(rows)
      }
    })
  })
}

/* target */
ipcMain.on('new-target', function (e, data) {
  console.log('new-target', data)
  let new_target = {
    id: uuidgen(),
    name: data.name,
    address: data.address,
    icon: '', //在前端使用默认的 icon 
    position: 0
  }
  db_save_new_target(new_target)
  main_utils.notify_all_windows('new-target', new_target)
})

ipcMain.on('update-target', function (e, data) {
  console.log('update-target', data)
  db_update_target_config(data.id, data.name, data.address, data.min_change, data.min_text_line, data.way, data.added_only)
})


ipcMain.on('get-all-targets', function (e, data) {
  console.log('get-all-target')
  db_get_all_targets(function (rows) {
    main_utils.notify_all_windows('all-targets', {
      targets: rows
    })
  })
})

ipcMain.on('remove-target', function (e, data) {
  console.log('remove-target')
  db_remove_target(data)
  db_delete_records(data)
})

ipcMain.on('set-target-state', function (e, data) {
  db_set_target_state(data.target_id, data.state)
})

ipcMain.on('set-target-muted', function (e, data) {
  db_set_target_muted(data.target_id, data.state)
})

/* monitoring */
let g_main_timer
function monitor_init() {
  console.log('monitor init')
  monitor_reset_main_timer()
}

let g_current_interval_minutes = 10 //helping only
function monitor_reset_main_timer() {
  console.log('reset main monitor timer')
  if (g_main_timer) {
    clearInterval(g_main_timer)
    g_main_timer = null
  }
  g_current_interval_minutes = g_interval_map[store.get('config').check_interval]
  g_main_timer = setInterval(monitor_round, g_current_interval_minutes * 1000 * 60)
  //first round will go after an whole interval by setInterval, so we manually call it imediately
  if (g_current_interval_minutes > 30) {
    // if interval too long, do the first time manually
    setTimeout(monitor_round, 5 * 60 * 1000)
  }
}

function monitor_round() {
  console.log('round')

  //在interval内平均分配时间做每个target的check
  let round_seconds = g_current_interval_minutes * 60

  db_get_all_targets(function (targets) {
    targets = targets.filter(function (v) {
      return v.state == utils.TARGET_STATE.NORMAL
    })

    let num_targets = targets.length

    if (num_targets > 0) {
      let mini_interval = round_seconds * 1000.0 / num_targets  //in ms
      targets.forEach(function (target, index) {
        setTimeout(function () {
          monitor_check(target)
        }, mini_interval * index)
      })
    }
  })
}
const g_ua_desktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36"

function monitor_check(target) {
  console.log('monitor check', target.name)
  request.get(target.address)
    .set('User-Agent', g_ua_desktop)
    .timeout({
      response: 60000,  // Wait some seconds for the server to start sending,
      deadline: 120000, // but allow 1 minute for the file to finish loading.
    })
    .end(function (err, res) {
      let status_code = res ? res.status : 0
      let content = res ? res.text : ''
      content = content.split('"//').join('"http://') //防止非指定的//带来的干扰

      // content = htmlToText.fromString(content, {
      //   linkHrefBaseUrl: new URL(target.address).origin
      // })
      target_check_routine(target, err, status_code, content)
    })
}

function target_check_routine(target, err, status_code, new_content_html) {
  db_get_last_record(target.id, function (records) {
    let last_record = null
    if (records.length > 0) {
      last_record = records[0]
    }

    let new_record = null

    if (err) {
      console.log('except', err.status, err.code)
      let new_record_status = "Unreachable"

      if (err.status) {
        //服务器说的错误404 503等
        new_record_status = '' + err.status
      }

      if (err.code) {
        //DNS，网络不同，超时等错误
        new_record_status = err.code
      }

      let b_new_exception_record = true
      if (last_record) {
        if (last_record.state == utils.RECORD_STATE.EXCEPTION && last_record.status == new_record_status) {
          //和上次异常一样，不新增
          b_new_exception_record = false
        }
      }

      if (b_new_exception_record) {
        console.log("new exception record")

        new_record = {
          id: uuidgen(),
          target_id: target.id,
          html: last_record == null ? '' : last_record.html, //raw html在exception中传递
          read: 0,
          flag: 0,
          time: new Date().getTime(), //Math.floor(new Date().getTime()/1000),
          number: 0,
          state: utils.RECORD_STATE.EXCEPTION,
          status: new_record_status,
          added: 0,
          deleted: 0
        }
      }

    } else {
      // no except
      let old_content_html = ""

      if (last_record) {
        old_content_html = last_record.html
      }

      // html way & text way
      if (target.way == utils.TARGET_WAY.HTML || target.way == utils.TARGET_WAY.TEXT) {

        let base_url_href = new URL(target.address).origin

        let old_compare_source = null
        let new_compare_source = null

        if (target.way == utils.TARGET_WAY.HTML) {
          old_compare_source = old_content_html
          new_compare_source = new_content_html
        } else {
          old_compare_source = htmlToText.fromString(old_content_html, {
            linkHrefBaseUrl: base_url_href
          })

          old_compare_source = old_compare_source.replace('[HTTP', '[http') //hack for [http ] url fetch in index.js

          new_compare_source = htmlToText.fromString(new_content_html, {
            linkHrefBaseUrl: base_url_href
          })

          new_compare_source = new_compare_source.replace('[HTTP', '[http')
        }

        if (old_compare_source.length != new_compare_source.length || old_compare_source != new_compare_source) { //rouch check
          //has diff really

          let dmp = new gdiff.diff_match_patch()
          let diff = dmp.diff_main(old_compare_source, new_compare_source)
          dmp.diff_cleanupSemantic(diff)

          diff = diff.filter(function (part) { return utils.len(part[1]) > target.min_text_line })

          let added = 0
          let deleted = 0

          diff.forEach(function (part) {
            switch (part[0]) {
              case -1:
                deleted += utils.len(part[1])
                break
              case 1:
                added += utils.len(part[1])
                break
            }
          })

          let total_change = target.added_only == 0 ? added + deleted : added
          if (total_change > target.min_change) {
            new_record = {
              id: uuidgen(),
              target_id: target.id,
              html: new_content_html, //raw html
              read: 0,
              flag: 0,
              time: new Date().getTime(),
              number: 0, //set later
              state: utils.RECORD_STATE.NORMAL,
              status: `${target.way == utils.TARGET_WAY.HTML ? 'HTML' : 'TEXT'}(-${deleted} +${added})`,
              added: added,
              deleted: deleted,
              diff: JSON.stringify({ way: target.way, diff: diff })
            }
          }


        }
      }
      // html way & text way [end]
      else {
        // link way  

        let old_links = linkway.get_links(target.address, old_content_html)
        let new_links = linkway.get_links(target.address, new_content_html)

        let diff = deepdiff.diff(old_links, new_links)
        if (!diff) {
          console.log('!!!!no diff')
        }
        if (diff) {

          let added = 0
          let deleted = 0
          let added_text = 0
          let deleted_text = 0
          diff.forEach(function (part) {
            if (part.kind == 'N') {
              added += 1
              if (utils.len(part.rhs.text) > target.min_text_line) {
                added_text += utils.len(part.rhs.text)
              }
            }
            if (part.kind == 'D') {
              deleted += 1
              if (utils.len(part.lhs.text) > target.min_text_line) {
                deleted_text += utils.len(part.lhs.text)
              }
            }
          })


          let total_text_diff = added_text + (target.added_only == 0 ? deleted_text : 0)
          console.log('link monitor result', added, deleted, added_text, deleted_text, total_text_diff)

          if (added + deleted > 0 && total_text_diff > target.min_change) {
            new_record = {
              id: uuidgen(),
              target_id: target.id,
              html: new_content_html, //raw html
              read: 0,
              flag: 0,
              time: new Date().getTime(),
              number: 0, //set later
              state: utils.RECORD_STATE.NORMAL,
              status: `LINK(-${deleted_text}|${deleted} +${added_text}|${added})`,
              added: added_text,
              deleted: deleted_text,
              diff: JSON.stringify({ way: target.way, diff: diff })
            }
          }
        } // ELSE diff=null

      }// link way  [end]

      // 无异常，无变更
      // 若上次为异常，则本record为recover
      if (new_record == null && last_record && last_record.state == utils.RECORD_STATE.EXCEPTION) {
        new_record = {
          id: uuidgen(),
          target_id: target.id,
          html: new_content_html, //raw html
          read: 0,
          flag: 0,
          time: new Date().getTime(),
          number: 0, //set later
          state: utils.RECORD_STATE.RECOVERY,
          status: `RECOVERY`,
          added: 0,
          deleted: 0,
          diff: ''
        }

      }
    }    //no except [end]

    if (new_record) {
      db_get_target_by_id(target.id, function (target) {
        new_record.number = target.topindex
        on_new_record(target, new_record)
      }) //不使用以前取的target，而是现在取，为了获得最新的topindex
    }

  })

  if (target.icon.length == 0) {
    getFavicons(new_content_html).then(icons => {
      console.log("--->found favicons", icons)
      if (icons.length > 0) {
        let new_icon = icons[0].href
        if (new_icon.startsWith('http')) {

        } else if (new_icon.startsWith('//')) {
          new_icon = "http:" + new_icon
        }
        else {
          let url = new URL(target.address)

          if (new_icon.startsWith('/')) {
            new_icon = url.origin + new_icon
          } else {
            new_icon = url.origin + url.pathname + new_icon
          }
        }

        console.log('--->converted icon', new_icon)
        if (target.icon != new_icon) {
          on_target_new_icon(target, new_icon)
        }
      }
    })
  }

}

ipcMain.on('new-record', function (err, target_id) {
  let new_record = {
    id: uuidgen(),
    src_title: '',
    des_title: '',
    note: '',
    src_text: '',
    des_text: '',
    create_time: utils.now(),
    edit_time: utils.now(),
    src_address: '',
    des_address: '',
    image: '',
    target_id: target_id,
    src_desc: '',
    des_desc: ''
  }

  db_save_new_record(new_record)
  main_utils.notify_all_windows('new-record', new_record)
})

ipcMain.on('remove-record', function (e, data) {
  console.log('remove-record')
  db_remove_record(data)
})
function on_new_record(target, new_record) {
}

function on_target_new_icon(target, new_icon) {
  db_set_target_icon(target.id, new_icon)
  //TODO notify
  main_utils.notify_all_windows('new-target-icon', { target_id: target.id, icon: new_icon })
}

/* records */
ipcMain.on('get-some-records', function (e, data) {
  db_get_some_records(data.target_id, data.offset, function (records) {
    main_utils.notify_all_windows('some-records', records)
  })

  db_set_target_read(data.target_id, 1)
})

ipcMain.on('get-record-data', function (e, data) {
  console.log('get record', data)

  db_get_record(data, function (record) {
    main_utils.notify_all_windows('record-data', record)
  })
})

ipcMain.on('read-record', function (e, data) {
  db_set_record_read(data)
})

ipcMain.on('mark-all-read', function (e, data) {
  db_mark_all_read(data)
  db_set_target_read(data, 1)
})

ipcMain.on('delete-records', function (e, data) {
  db_delete_records(data)
})

ipcMain.on('update-record-data', function(e, data) {
  console.log('save record')
  db_update_record_data(data)
})


ipcMain.on('open-snapshot', function (e, data) {
  console.log('open snapshot of ', data)
  db_get_record(data, function (record) {
    if (record) {
      let snap_file = path.join(__dirname, 'snapshot', record.id + '.html') //存在不同且固定的文件中，使得能够在浏览器中保持地址等
      fs.writeFile(snap_file, record.html, function (err) {
        if (err) {
          throw err
        } else {
          let url = 'file://' + snap_file
          console.log(url)
          electron.shell.openExternal(url)
        }
      }) //TODO move to userdata
    }
  })
})



ipcMain.on('open-record', function (e, data) {
  console.log('open-record', data)

  createMainWindow()

  setTimeout(function () {
    main_utils.notify_all_windows('cmd-select-target', data.target_id)
  }, 500)


  setTimeout(function () {
    main_utils.notify_all_windows('cmd-select-record', data.record_id)
  }, 1000)
})

