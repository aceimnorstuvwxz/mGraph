const electron = require('electron');
const path = require('path');
const locale = require('./locale')
const utils = require('./utils')
const moment = require('moment')
const { remote } = require('electron')
const { Menu, MenuItem } = remote
const Store = require('electron-store')
const store = new Store()
const urllib = require('url')
const fs = require('fs')
const mystore = require('./mystore')
const TurndownService = require('turndown')
let turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  linkStyle: 'referenced',
  linkReferenceStyle: 'full',
  hr: '***'
})
const trans = require('./transfan')
const rmmd = require('./rmmd')

/* monaco editor */
amdRequire(['vs/editor/editor.main'], () => {
  onModuleLoaded();
})

let g_src_editor = null

let g_editor_options = {
  value: [
  ].join('\n'),
  language: 'markdown',
  automaticLayout: true,
  theme: "vs-light",
  lineNumbers: "off",
  fontFamily: "Menlo",
  fontSize: 14,
  wordWrap: 'on',
  codeLens: false,
  formatOnPaste: true,
  glyphMargin: false,
  minimap: {
    enabled: true
  },
  lineNumbersMinChars: 2,
  scrollBeyondLastLine: false,
  scrollbar: {
    // vertical: 'visible',
    verticalScrollbarSize: 3
  },
  folding: false,
  // contextmenu: false // no builtin contextmenu
}

function onModuleLoaded() {
  g_src_editor = monaco.editor.create(document.getElementById('src_editor'), g_editor_options)
  on_editor_inited()
}

let g_to_load_last_record = true;
function try_load_last_record() {
  if (g_src_editor && g_selected_target_element && g_to_load_last_record) {
    g_to_load_last_record = false;
    let p = store.get('last-record-path', null);
    if (p) on_select_record(g_record_map[p]);
    
  }
}

let g_side_width = 0
function update_editor_layout() {
  let unmain_width_total = $('#records_space').width() + $('#targets_space').width() + g_side_width
  let w = (window.innerWidth - unmain_width_total)

  if (g_src_editor) {
    g_src_editor.layout({ width: w, height: window.innerHeight - 30 })
  }
}

window.onresize = function (e) {
  update_editor_layout()
}

document.addEventListener('DOMContentLoaded', function () {
  console.log("init window")
  locale.init()

 
  toastr.options = {
    "closeButton": false,
    "debug": false,
    "newestOnTop": false,
    "progressBar": false,
    // "positionClass": "toast-bottom-center",
    "preventDuplicates": false,
    "onclick": null,
    "showDuration": "300",
    "hideDuration": "5000",
    "timeOut": "2000",
    "extendedTimeOut": "1000",
    "showEasing": "swing",
    "hideEasing": "linear",
    "showMethod": "fadeIn",
    "hideMethod": "fadeOut"
  }


  $('#btn_add_new_target').click(on_click_new_target)
  $('#btn_add_record').click(on_click_new_record)

  setInterval(update_moment_time, 30 * 1000)

  $('#btn_dev').click(on_click_dev_test)
  $('#btn_toggle_targets').click(on_click_toggle_targets)

  setInterval(save_routine, 30 * 1000)

  reset_target_space_width()

  reload_targets();


})

/* targets */
let g_target_map = {}
function add_new_target_element(target) {
  let new_element = $('#target_template').clone()
  new_element.removeAttr('id')
  let ww = target.split(path.sep)
  let p = ww.pop()
  let p2 = ww.pop()
  new_element.find('.target-name').text(p)

  new_element.prependTo('#target_list')
  new_element.web_target_path = target
  g_target_map[target] = new_element

  new_element.click(on_select_target.bind(null, target))

  new_element.contextmenu(function (e) {
    e.preventDefault()
    const menu = new Menu()
    menu.append(new MenuItem({ label: 'Remove', click: on_click_remove_target.bind(null, new_element) }))
    menu.append(new MenuItem({ label: 'Reveal in Finder', click: on_reveal_in_finder.bind(null, new_element) }))
    menu.append(new MenuItem({ type: 'separator' }))

    menu.append(new MenuItem({ label: 'New Collection', click: on_click_new_target }))
    menu.popup({ window: remote.getCurrentWindow() })
  })

  new_element.dblclick(on_reveal_in_finder.bind(null, new_element))
}

function on_click_remove_target(target_element) {
  if (confirm('Remove this folder?')) {
    mystore.remove_target(target_element.web_target_path)
    if (g_selected_target_element == target_element) {
      unselect_current_record(clear=true)
      unselect_current_target(clear=true)
    }
    delete g_target_map[target_element.web_target_path]
    target_element.remove()
  }
}

function on_reveal_in_finder(target_element) {
  electron.remote.shell.openItem(target_element.web_target_path);
}

let g_selected_target_element = null

function on_select_target(target_path) {
  let element = g_target_map[target_path]
  console.log('click select element', target_path)

  if (g_selected_target_element == element) {
    return
  }

  if (g_selected_target_element) {
    g_selected_target_element.attr('select', 'false')
  }

  element.attr('select', 'true')
  g_selected_target_element = element

  $('#record_list').empty()
  g_record_map = {}

  reload_target_records()

  store.set('last-target-path', target_path)
}

let SUPPORTED_EXT_LIST = ['md', 'MD', 'txt', 'TXT']
function reload_target_records() {
  let target = g_selected_target_element.web_target_path
  console.log('reload target reocrds', target)

  if (!fs.existsSync(target)) {
    alert(`${target} ${utils.lg('不存在', "doesn't exist")}`)
    return
  }

  fs.readdir(target, (err, files) => {
    let ents = []
    files.forEach(file => {
      // console.log(file);
      let ext = utils.get_file_ext(file)
      if (SUPPORTED_EXT_LIST.indexOf(ext) != -1) {
        //is image
        let tmp_full_path = path.join(target,file);
        let stat = fs.statSync(tmp_full_path)
        ents.push({f:tmp_full_path,s:stat})
        console.log(tmp_full_path, stat);
      }
    });


    ents = ents.sort((a,b)=>{return b.s.ctimeMs - a.s.ctimeMs})

    ents.forEach(ent=>{
      add_new_record_element(ent.f);
    })

    try_load_last_record();
    //TODO should check file is real file
    //https://stackoverflow.com/questions/2727167/how-do-you-get-a-list-of-the-names-of-all-files-present-in-a-directory-in-node-j
  })
}

function unselect_current_record(clear=false) {
  if (g_selected_record_element) {
    g_dirty = false
    g_selected_record_element.attr('select', 'false')
    g_selected_record_element = null
    if (clear) {
      g_src_editor.setValue('')
    }
  }
}

function unselect_current_target(clear=false){
  if (g_selected_target_element) {
    g_selected_target_element.attr('select', 'false')
    g_selected_target_element = null

    if (clear) {
      $('#record_list').empty()
      g_record_map = {}
    }
  }
}

function update_moment_time() {
  // for (let key in g_record_map) {
  //   let record_element = g_record_map[key]
  //   record_element.find('.record-time').text(record_element.web_time.fromNow())
  // }
}

function on_click_new_target() {
  let folder_name = electron.remote.dialog.showOpenDialog({ properties: ['openDirectory'] })
  console.log(folder_name)
  if (folder_name && folder_name.length > 0) {
    folder_name = folder_name[0]
    if (mystore.get_targets().indexOf(folder_name) != -1) {
      alert(utils.lg('这个文件夹早就被加入了', 'This folder has already been added'))
    } else {
      mystore.add_target(folder_name)
    }
  }

  reload_targets()
}

function reload_targets() {
  let targets = mystore.get_targets()
  console.log('targets', targets)

  $('#target_list').empty()
  g_target_map = {}

  targets.forEach(target => {
    add_new_target_element(target)
  })

  let p = store.get('last-target-path', null);
  if (p) on_select_target(p);

}

let g_record_map = {}

function refresh_record_ui(record_element) {
  //根据他的web_record_path指向的文件
  record_element.find('.record-name').text(record_element.web_record_path.split(path.sep).pop())
}

function add_new_record_element(full_path, top=false) {

  let new_element = $('#record_template').clone()
  new_element.removeAttr('id')
  new_element.web_record_path = full_path
  if (top) {
    new_element.prependTo('#record_list')
  } else {
    new_element.appendTo('#record_list')
  }
  g_record_map[full_path] = new_element

  refresh_record_ui(new_element)

  new_element.click(on_select_record.bind(null, new_element))

  new_element.contextmenu(function (e) {
    e.preventDefault()
    const menu = new Menu()
    menu.append(new MenuItem({ label: 'Delete', click: on_click_record_delete.bind(null, new_element) }))
    menu.append(new MenuItem({ label: 'Open in Wild', click: on_click_open_record_external.bind(null, new_element) }))
    menu.append(new MenuItem({ type: 'separator' }))

    menu.append(new MenuItem({ label: 'New Note', click: on_click_new_record }))
    menu.popup({ window: remote.getCurrentWindow() })
  })

  new_element.dblclick(on_click_open_record_external.bind(null, new_element))
}
function delete_record_ex(element) {
  fs.unlink(element.web_record_path, (err)=>{
    if (err) {
      alert(err)
    } else {
      toastr.info('deleted')
      if (element == g_selected_record_element) unselect_current_record(clear=true);

      delete g_record_map[element.web_record_path];
      element.remove()
    }
  })
}
function on_click_record_delete(element) {
  let stat = fs.statSync(element.web_record_path)
  if (Math.abs(stat.ctimeMs - stat.mtimeMs) < 1000 ) {
    //创建时间和修改时间差不多，说明没编辑过，可以直接删除
    delete_record_ex(element);
  } else {
    if (confirm('delete this file?')) {
      delete_record_ex(element);
    }
  }
}

function on_click_open_record_external(element) {
  electron.remote.shell.openItem(element.web_record_path);
}

function on_click_record_toggle_pintop(element) {

}

let g_selected_record_element = null
function on_select_record(element) {

  if (g_selected_record_element == element) {
    return
  }

  save_routine()

  unselect_current_record()

  element.attr('select', 'true')
  g_selected_record_element = element

  reload_record_data()

  store.set('last-record-path', element.web_record_path)
}

function get_current_record_file() {
  if (g_selected_record_element) {
    return g_selected_record_element.web_record_path;
  } else {
    return null;
  }
}

function reload_record_data() {
  let fn = get_current_record_file();
  if (fn) {
    fs.readFile(fn, (err, data) => {
      if (err) {
        alert(err)
      } else {
        let text = data.toString()
        let tmp_infile = fetch_file_name(text);
        let fn_real = fn.split(path.sep).pop()
        if (fn_real != tmp_infile) {
          //需手动增设@file_name的第一行
          text = `@${fn_real}\n` + text;
        }
        g_src_editor.setValue(text);
        g_dirty = false
      }
    })
  }
}

function on_click_new_record() {

  if (g_selected_target_element) {
    let file_name = 'unamed-' + (Date.now() % 10000) + '.md'
    let new_fn = path.join(g_selected_target_element.web_target_path, file_name);
    fs.writeFile(new_fn, '@' + file_name, (err) => {
      toastr.info('new file')
    })

    add_new_record_element(new_fn, top=true)
    on_select_record(g_record_map[new_fn])
  }
}

function on_click_save() {
  save_routine()
}

let g_dirty = false
function save_routine() {
  console.log('save routine')
  let fn_curr = get_current_record_file()
  if (fn_curr && g_dirty) {
    g_dirty = false
    let tmp_data = g_src_editor.getValue()
    let new_filename = fetch_file_name(tmp_data)
    console.log('gen fn', new_filename)
    let tmp_fn = path.join(g_selected_target_element.web_target_path, new_filename)
    if (tmp_data.startsWith('@')) {
      tmp_data = tmp_data.slice(tmp_data.indexOf('\n')+1)
    }
    fs.writeFile(fn_curr, tmp_data, (err) => {
      if (err) {
        alert(err)
      } else {
        toastr.info('saved');

      if (new_filename.length > 0 &&  tmp_fn != fn_curr) {
        //需要重命名
        fs.rename(fn_curr, tmp_fn, (err)=>{
          if (err){
            alert(err)
          } else {
            toastr.info('renamed');
            g_selected_record_element.web_record_path = tmp_fn;
            refresh_record_ui(g_selected_record_element);
          }
        })
      }
      }
    })

  }
}

function fetch_file_name(data) {
  let first_line = data.split('\n')[0]
  let fn = ''
  if (first_line.startsWith('@')) {
    fn = first_line.slice(1)
  } else {
    fn = rmmd.rmmd(first_line, nd=true)
  }
  if (fn.length > 0 && SUPPORTED_EXT_LIST.indexOf(utils.get_file_ext(fn.toLowerCase())) == -1) {
    fn = fn + '.md'
  }
  return fn;
}

window.onbeforeunload = function () {
  console.log("try save before close")
  save_routine()
  store.set('width', window.innerWidth)
  store.set('height', window.innerHeight)
}

function on_editor_inited() {

  // title desc following!
  let src_model = g_src_editor.getModel()
  src_model.onDidChangeContent(function (e) {

    if (g_selected_record_element == null) {
      return
    }
    g_dirty = true

    e.changes.forEach(function (change) {
      if (change.range.startLineNumber < 5) {
        // let top2 = find_top_2_filled_line(src_model)
        // let new_title = rmmd.rmmd(notnull(top2[0]), true)
        // let new_desc = rmmd.rmmd(notnull(top2[1]), true)
        // if (g_current_record_data.src_title != new_title) {
        //   g_current_record_data.src_title = new_title
        //   on_selected_record_title_data_changed()
        // }
        // if (g_current_record_data.src_desc != new_desc) {
        //   g_current_record_data.src_desc = new_desc
        //   on_selected_record_desc_data_changed()
        // }
      }
    })
  })

  init_context_acions();
  try_load_last_record();
}

function init_context_acions() {

  // paste as Markdown
  g_src_editor.addAction({
    id: 'myact-paste-as-markdown',
    label: 'Paste as Markdown',
    keybindings: [
      monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_P)
    ],
    precondition: null,
    keybindingContext: null,
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.5,
    run: function (ed) {
      on_paste_as_markdown(ed)
      return null;
    }
  })

  // google
  // g_src_editor.addAction({
  //   id: 'myact-search',
  //   label: 'Google It',
  //   precondition: null,
  //   keybindingContext: null,
  //   contextMenuGroupId: 'navigation',
  //   contextMenuOrder: 1.5,
  //   run: function (ed) {
  //     let selected_text = g_src_editor.getModel().getValueInRange(g_src_editor.getSelection())
  //     console.log('selected', selected_text)

  //     utils.google(selected_text)
  //     return null;
  //   }
  // })

  // translate to clipboard

  // g_src_editor.addAction({
  //   id: 'myact-translate',
  //   label: 'Translate',
  //   precondition: null,
  //   keybindingContext: null,
  //   contextMenuGroupId: 'navigation',
  //   contextMenuOrder: 1.6,
  //   run: function (ed) {
  //     let selected_text = g_src_editor.getModel().getValueInRange(g_src_editor.getSelection())
  //     console.log('selected', selected_text)

  //     g_translating_src_lines = selected_text.split('\n')
  //     g_translating_line_index = 0
  //     g_translating_is_for_all = false
  //     g_translating_for_copy_cache = ''
  //     trans_next_line()
  //     return null;
  //   }
  // })
}

/* cmd */
electron.ipcRenderer.on('cmd-new-target', function (e, data) {
  on_click_new_target()
})

electron.ipcRenderer.on('cmd-new-record', function (e, data) {
  on_click_new_record()
})

electron.ipcRenderer.on('cmd-save', function (e, data) {
  on_click_save()
})

electron.ipcRenderer.on('cmd-toggle-preview', function (e, data) {
  if ($('#btn_markdown').attr('pressed') == "true") {
    on_click_btn_preview()
  } else {
    on_click_btn_markdown()
  }
})


function on_click_dev_test() {
  console.log('dev test')

  // let model = g_src_editor.getModel()

  // let pos = new monaco.Range(1,1,1,1)
  // console.log(pos)
  // console.log(model.pushEditOperations)
  // model.pushEditOperations(new monaco.Selection(1,1,1,1), { //DONT know how to make it work!
  //   range: pos, text: 'hello world'
  // }, null)


  // way to put at certain pos
  g_src_editor.executeEdits("", [
    { range: new monaco.Range(1, 1, 1, 1), text: "prepend" }
  ])

  // way to pust at cursor
  g_src_editor.trigger('keyboard', 'type', { text: "中国人" })
  console.log(getEventListeners(document.getElementById('src_editor')))
}

function on_paste_as_markdown(editor) {

  let html = electron.clipboard.readHTML()
  let markdown = turndownService.turndown(html)

  editor.executeEdits("", [
    { range: editor.getSelection(), text: markdown }
  ])
}

function on_click_toggle_targets() {
  store.set('target_space', !store.get('target_space', true))
  reset_target_space_width()
}

function reset_target_space_width() {
  let flag = store.get('target_space', true)
  $('#window_header').css('grid-template-columns', flag ? '150px 200px 1fr 1fr' : '80px 120px 1fr 1fr')
  $('#total').css('grid-template-columns', flag ? '150px 200px 1fr auto' : '0px 200px 1fr auto')
  if (flag) {
    $('#show_icon').hide()
    $('#hide_icon').show()
  } else {
    $('#show_icon').show()
    $('#hide_icon').hide()
  }
  update_editor_layout()
}