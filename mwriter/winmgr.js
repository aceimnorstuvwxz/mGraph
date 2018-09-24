//(C 2018 netqon.com
//简单小窗口的简单管理器
const electron = require('electron')
const path = require('path')
const urllib = require('url')

let g_win_map = {}
exports.open_win = (win_name, w = 500, h = 900) => {
    //打开的目标就是win_name.html
    console.log('open win', win_name);

    //检查是否已经打开了
    if (g_win_map[win_name]) {
        g_win_map[win_name].show();
        return;
    }

    //创建并打开窗口
    let win_option = {
        width: w,
        height: h
    }
    
    let mywin = new electron.BrowserWindow(win_option);
    g_win_map[win_name] = mywin;

    mywin.loadURL(urllib.format({
        pathname: path.join(__dirname, `${win_name}.html`),
        protocol: 'file:',
        slashes: true
    }));

    mywin.webContents.on('new-window', function (event, url) {
        event.preventDefault();
        electron.shell.openExternal(url);
    });

    mywin.on('closed', function () {
        mywin = null;
        delete g_win_map[win_name];
    });
}
