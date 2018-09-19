const electron = require('electron')
const { app, BrowserWindow, Menu, ipcMain, globalShortcut, crashReporter } = electron;
const utils = require('./utils')
const uuidgen = require('uuid/v4');
const main_utils = require('./main_utils')
const Store = require('electron-store')
const request = require('superagent');
const store = new Store()
const { URL } = require('url')
const htmlToText = require('html-to-text');
const fs = require('fs')

/* config */
let g_config_cache = null

g_config_cache = store.get('config', {
  notify_change: true,
  notify_exception: true,
  notify_recovery: true,
  check_interval: 'B',
  launch_at_login: true
})

// /* Single instance */
// if (utils.is_win()) {
//   if (app.makeSingleInstance(single_instance_callback)) {
//     //第二个进程，直接退出
//     console.log('second instance, quit imediately')
//     app.exit(0)
//   }
// }

// function single_instance_callback(argv, workdir) {
//   //另一个进程想要启动，直接打开单粒的主窗口
//   console.log("second instance try to open, open raw instance's main windows instead")
//   createMainWindow()
// }

const path = require('path')
const url = require('url')


app.on('ready', function () {
  createMainWindow()
  const menu = Menu.buildFromTemplate(get_menu_template())
  Menu.setApplicationMenu(menu)
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
    createMainWindow()
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
        { role: 'about', label: lg('关于 MWriter', 'About MWriter') },
        { type: 'separator' },
        {
          label: lg('偏好设置', 'Preferences'),
          accelerator: 'CommandOrControl+,',
          click() { createSettingWindow() }
        },
        { role: 'services', label: lg('服务', 'Services'), submenu: [] },
        { type: 'separator' },
        { role: 'hide', label: lg('隐藏 MWriter', 'Hide MWriter') },
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
        label: lg('关于 MWriter', 'About MWriter'),
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
      webPreferences: { webSecurity: true },
      width: store.get('width', 1400),
      height: store.get('height', 600),
      // titleBarStyle: 'hidden'
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
