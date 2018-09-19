const markdown = require("markdown").markdown;
const wc = require('word-count')
const jsonfile = require('jsonfile')
const electron = require('electron');
const path = require('path');
const locale = require('./locale')
const utils = require('./utils')
const moment = require('moment')
const { remote } = require('electron')
const { Menu, MenuItem } = remote
const Store = require('electron-store')
const store = new Store()
const htmlencode = require('htmlencode');
const URL = require('url')
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
let g_des_editor = null

let g_editor_options = {
  value: [
    '# hello netqon'
  ].join('\n'),
  language: 'markdown',
  automaticLayout: true,
  theme: "vs-light",
  lineNumbers: "on",
  fontFamily: "Menlo",
  fontSize: 14,
  wordWrap: 'on',
  codeLens: false,
  formatOnPaste: true,
  glyphMargin: false,
  minimap: {
    enabled: false
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
  g_des_editor = monaco.editor.create(document.getElementById('des_editor'), g_editor_options)

  on_editor_inited()

}


// let g_unmain_width_total = 400+100
// function update_unmain_width_total(){
//     g_unmain_width_total = $('#records_space').width() + $('#targets_space').width() + $('#side').width()
// }
let g_side_width = 0
function update_editor_layout() {
  // to fix editor can not auto width down
  let unmain_width_total = $('#records_space').width() + $('#targets_space').width() +  g_side_width
  let w = (window.innerWidth - unmain_width_total) / 2

  //below way, will cause too many time, so the screen will flash white
  // let w = (window.innerWidth - $('#record_space').width - $('#target_space').width - $('#side').width)/2

  if (g_src_editor && g_des_editor) {
    g_src_editor.layout({ width: w, height: window.innerHeight - 30 })
    g_des_editor.layout({ width: w, height: window.innerHeight - 30 })
  }
}

window.onresize = function (e) {
  update_editor_layout()
}

/* ui */

document.addEventListener('DOMContentLoaded', function () {
  console.log("init window")
  locale.init()

  /*
  toastr.options = {
    "closeButton": false,
    "debug": false,
    "newestOnTop": false,
    "progressBar": false,
    "positionClass": "toast-bottom-center",
    "preventDuplicates": false,
    "onclick": null,
    "showDuration": "300",
    "hideDuration": "1000",
    "timeOut": "5000",
    "extendedTimeOut": "1000",
    "showEasing": "swing",
    "hideEasing": "linear",
    "showMethod": "fadeIn",
    "hideMethod": "fadeOut"
  }*/

  electron.ipcRenderer.send('get-all-targets')

  $('#btn_add_new_target').click(on_click_new_target)
  $('#btn_add_target_confirm').click(on_click_btn_add_new_target_confirm)
  $('#btn_remove_target_confirm').click(on_click_remove_target_confirm)
  $('#btn_remove_record_confirm').click(on_click_remove_record_confirm)

  $('#btn_add_record').click(on_click_new_record)

  $('#records_space').scroll(function (e) {
    // console.log(e.target.scrollTop, $(window).height(), e.target.clientHeight, $('#record_list').height())
    if (g_selected_target_nomore_record == false && g_record_more_loading == false && e.target.scrollTop + $(window).height() >= $('#record_list').height() - 50) {
      g_record_more_loading = true
      console.log('get more record')
      electron.ipcRenderer.send('get-some-records', { target_id: g_selected_target_element.web_target.id, offset: $('.record').length - 1 }) //offset remove template

    }
  })

  $('#fill_target_space').contextmenu(function (e) {
    e.preventDefault()
    const menu = new Menu()
    menu.append(new MenuItem({ label: 'New Collection', click: on_click_new_target }))
    menu.popup({ window: remote.getCurrentWindow() })
  })


  $('#fill_record_space').contextmenu(function (e) {
    e.preventDefault()
    const menu = new Menu()
    menu.append(new MenuItem({ label: 'New Record', click: on_click_new_record }))
    menu.popup({ window: remote.getCurrentWindow() })
  })

  setInterval(update_moment_time, 30 * 1000)

  $('#btn_dev').click(on_click_dev_test)
  $('#btn_translate').click(on_click_translate)

  $('#btn_markdown').click(on_click_btn_markdown)
  $('#btn_preview').click(on_click_btn_preview)
  $('#btn_mdguide').click(on_click_btn_mdguide)
  $('#btn_info').click(on_click_on_info)
  $('#btn_toggle_targets').click(on_click_toggle_targets)

  setInterval(save_routine, 30 * 1000)


  setTimeout(function(){
    let t = store.get('target')
    if (t) {
      on_select_target(t)
    }

    if (store.get('mdguide', false)) {
      on_click_btn_mdguide()
    }
    
  }, 200)

  setTimeout(function(){
    let t = store.get('record')
    if (t) {
      on_select_record(t)
    }
  }, 500)

  reset_target_space_width()
})

/* targets */
let g_is_target_new = true
let g_under_config_target_element = null
let g_target_map = {}
let g_selected_target_nomore_record = false //是否当前的target已经没有可以下滑加载的更多的record了
let g_record_more_loading = false //防止大量的record加载
function add_new_target_element(target) {
  let new_element = $('#target_template').clone()
  new_element.removeAttr('id')
  new_element.find('.target-name').text(target.name)
  new_element.find('.target-address').text(target.address)
  new_element.find('.target-indication').attr('indication', target.read == 0 ? 'true' : 'false')
  new_element.find('.target-paused').attr('paused', target.state == utils.TARGET_STATE.NORMAL ? "false" : "true")
  new_element.find('.target-muted').attr('muted', target.muted == 0 ? "false" : "true")

  let icon = target.icon
  if (icon.length == 0) {
    icon = "images/default-target-icon.png"
  }
  new_element.find('.target-image').attr('src', icon)

  new_element.prependTo('#target_list')
  new_element.web_target = target
  g_target_map[target.id] = new_element

  new_element.click(on_select_target.bind(null, target.id))

  new_element.contextmenu(function (e) {
    e.preventDefault()
    const menu = new Menu()
    menu.append(new MenuItem({ label: 'Edit', click: on_click_config_target.bind(null, new_element) }))
    menu.append(new MenuItem({ label: 'Remove', click: on_click_remove_target.bind(null, new_element) }))
    menu.append(new MenuItem({ label: 'View Address', click: on_click_open_in_browser.bind(null, new_element) }))
    menu.append(new MenuItem({ type: 'separator' }))

    menu.append(new MenuItem({ label: 'New Collection', click: on_click_new_target }))
    menu.popup({ window: remote.getCurrentWindow() })
  })
}

function on_click_open_in_browser(target_element) {
  electron.remote.shell.openExternal(target_element.web_target.address)
}

let g_under_removing_target_element = null
function on_click_remove_target(target_element) {
  g_under_removing_target_element = target_element
  $('#remove_target_dialog').find('#remove_target_name').text(target_element.web_target.name)
  $('#remove_target_dialog').modal('show')
}

let g_under_deleting_record_element = null
function on_click_remove_record(record_element) {
  g_under_deleting_record_element = record_element

  $('#remove_record_dialog').find('#remove_record_name').text(right_showing_title(record_element.web_record))
  $('#remove_record_dialog').modal('show')
}

let g_under_delete_records_element = null
function on_click_delete_records(target_element) {
  g_under_delete_records_element = target_element
  $('#delete_records_dialog').find('#delete_records_target_name').text(target_element.web_target.name)
  $('#delete_records_dialog').modal('show')
}

function on_click_mark_all_read(target_element) {
  if (g_selected_target_element == target_element) {
    $('.record').find('.record-indication').attr('type', '1')
  }

  target_element.find('.target-indication').attr('indication', 'false')

  electron.ipcRenderer.send('mark-all-read', target_element.web_target.id)
}

function on_click_remove_target_confirm() {
  $('#remove_target_dialog').modal('hide')

  if (g_under_removing_target_element == g_selected_target_element) {
    unselect_current_target()
  }
  g_under_removing_target_element.remove()
  electron.ipcRenderer.send('remove-target', g_under_removing_target_element.web_target.id)
  g_under_removing_target_element = null
}

function on_click_remove_record_confirm() {
  $('#remove_record_dialog').modal('hide')

  if (g_under_deleting_record_element == g_selected_record_element) {
    unselect_current_record()
  }

  g_under_deleting_record_element.remove()
  electron.ipcRenderer.send('remove-record', g_under_deleting_record_element.web_record.id)
  g_under_deleting_record_element = null
}

function on_click_delete_records_confirm() {
  $('#delete_records_dialog').modal('hide')
  $('#record_list').empty()
  electron.ipcRenderer.send('delete-records', g_under_delete_records_element.web_target.id)
  g_under_delete_records_element = null
}

function on_click_toggle_pause_target(target_element) {
  console.log('click pause/resume target')
  target_element.web_target.state = target_element.web_target.state == utils.TARGET_STATE.NORMAL ? utils.TARGET_STATE.PAUSED : utils.TARGET_STATE.NORMAL
  target_element.find('.target-paused').attr('paused', target_element.web_target.state == utils.TARGET_STATE.NORMAL ? "false" : "true")
  electron.ipcRenderer.send('set-target-state', { target_id: target_element.web_target.id, state: target_element.web_target.state })
}

function on_click_toggle_mute_target(target_element) {
  console.log('click mute/unmute target')
  target_element.web_target.muted = target_element.web_target.muted == 0 ? 1 : 0
  target_element.find('.target-muted').attr('muted', target_element.web_target.muted == 0 ? "false" : "true")
  electron.ipcRenderer.send('set-target-muted', { target_id: target_element.web_target.id, state: target_element.web_target.muted })
}

electron.ipcRenderer.on('new-target', function (e, target) {
  console.log('new target', target)
  add_new_target_element(target)
})

electron.ipcRenderer.on('all-targets', function (e, data) {
  console.log('all targets', data)
  data.targets.forEach((target, index) => {
    add_new_target_element(target)
  })
})

electron.ipcRenderer.on('new-target-icon', function (e, data) {
  console.log('new-target-icon', data)
  g_target_map[data.target_id].find('.target-image').attr('src', data.icon)
})

let g_selected_target_element = null
function on_select_target(target_id) {

  g_selected_target_nomore_record = false
  g_record_more_loading = false
  let element = g_target_map[target_id]
  let target = element.web_target
  console.log('click select element', target.name, target.id)

  if (g_selected_target_element == element) {
    //same one, pass
    return
  }

  //unselect current
  unselect_current_target()

  //select new
  element.attr('select', 'true')
  g_selected_target_element = element

  //clear records ui
  $('#record_list').empty()
  g_record_map = {}

  //get new target's records
  electron.ipcRenderer.send('get-some-records', { target_id: target.id, offset: $('.record').length - 1 }) //offset remove template

  element.find('.target-indication').attr('indication', 'false')

  store.set('target', target_id)
}

function unselect_current_target() {
  if (g_selected_target_element) {
    unselect_current_record()
    g_selected_target_element.attr('select', 'false')
    g_selected_target_element = null
  }
}

function unselect_current_record() {
  if (g_selected_record_element) {
    g_dirty = false

    g_selected_record_element.attr('select', 'false')
    g_selected_record_element = null

    g_src_editor.setValue('')
    g_des_editor.setValue('')
  }
}

function update_moment_time() {
  for (let key in g_record_map) {
    let record_element = g_record_map[key]
    record_element.find('.record-time').text(record_element.web_time.fromNow())
  }
}

function on_click_new_target() {
  g_is_target_new = true
  $('#target_dialog_title').text('New Collection')
  $('#new_target_name').val("")
  $('#new_target_address').val("")

  $('#new_target_dialog').modal('show')
}

function on_click_config_target(target_element) {
  g_is_target_new = false
  g_under_config_target_element = target_element
  $('#target_dialog_title').text('Edit Collection')

  $('#new_target_name').val(target_element.web_target.name)
  $('#new_target_address').val(target_element.web_target.address)

  $('#new_target_dialog').modal('show')
}

function on_click_btn_add_new_target_confirm() {
  let name = $('#new_target_name').val()
  let address = $('#new_target_address').val()

  if (name.length == 0) {
    toastr["error"]("Name is required")
    return
  }

  if (address.length > 0) {
    address += '    '
    if (address.slice(0, 4).toLowerCase() != 'http') {
      address = 'http://' + address
    }
  }

  address = address.trim()

  $('#new_target_dialog').modal('hide')
  if (g_is_target_new) {
    electron.ipcRenderer.send('new-target', {
      name: name,
      address: address,
    })
  } else {
    electron.ipcRenderer.send('update-target', {
      id: g_under_config_target_element.web_target.id,
      name: name,
      address: address,
    })

    g_under_config_target_element.find('.target-name').text(name)
    g_under_config_target_element.find('.target-address').text(address)
    g_under_config_target_element.web_target.address = address
    g_under_config_target_element.web_target.name = name

  }

}

/* records */

electron.ipcRenderer.on('new-record', function (e, data) {
  add_new_record_element(data, true)

  on_select_record(data.id)
})

electron.ipcRenderer.on('some-records', function (e, records) {
  console.log('all records', records)
  records.forEach(function (record) {
    add_new_record_element(record)
  })
  g_record_more_loading = false
  if (records.length == 0) {
    g_selected_target_nomore_record = true
    console.log('no more records')
  }
})

let g_record_map = {}
function right_showing_title(record) {
  let t = record.des_title.length > 0 ? record.des_title : record.src_title
  if (t.length == 0) {
    t = "Empty"
  }
  return t
}

function right_showing_desc(record) {
  let t = record.des_desc.length > 0 ? record.des_desc : record.src_desc
  if (t.length == 0) {
    t = "no description"
  }
  return t
}

function add_new_record_element(record, at_top = false) {
  let new_element = $('#record_template').clone()
  new_element.removeAttr('id')
  new_element.find('.record-title').text(right_showing_title(record))
  new_element.find('.record-desc').text(right_showing_desc(record))
  new_element.find('.record-image img').attr('src', 'http://wx3.sinaimg.cn/mw600/72b33adagy1fnmdw23lnvj21r61sgu10.jpg')
  let time = moment.unix(record.create_time / 1000)
  // new_element.find('.record-time').text(time.fromNow())
  new_element.web_record = record
  new_element.web_time = time
  if (at_top) {
    new_element.prependTo('#record_list')
  } else {
    new_element.appendTo('#record_list')
  }

  g_record_map[record.id] = new_element
  new_element.click(on_select_record.bind(null, record.id))

  new_element.contextmenu(function (e) {
    e.preventDefault()
    const menu = new Menu()
    menu.append(new MenuItem({ label: 'Delete', click: on_click_remove_record.bind(null, new_element) }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({ label: 'New Article', click: on_click_new_record }))

    menu.popup({ window: remote.getCurrentWindow() })
  })

  return new_element
}

let g_selected_record_element = null
function on_select_record(record_id) {
  let element = g_record_map[record_id]
  let record = element.web_record

  if (g_selected_record_element == element) {
    //same one, pass
    return
  }

  //try save current
  save_routine()

  //unselect current
  unselect_current_record()

  //select new
  element.attr('select', 'true')
  g_selected_record_element = element

  //fetch detail record data
  electron.ipcRenderer.send('get-record-data', record.id)

  store.set('record', record_id)
}

function on_click_new_record() {
  //check if any target selected
  if (g_selected_target_element == null) {
    toastr.error('Please select a collection first')
    return
  }

  electron.ipcRenderer.send('new-record', g_selected_target_element.web_target.id)
}


/* content */
let g_current_record_data = null
electron.ipcRenderer.on('record-data', function (e, data) {
  console.log(data)
  g_current_record_data = data

  g_src_editor.setValue(data.src_text)
  g_des_editor.setValue(data.des_text)
  g_dirty = false

})

function on_click_save() {
  console.log('do save')
  if (g_current_record_data == null) {
    toastr.info('Nothing to save')
    return
  }

  save_routine()
}

let g_dirty = false
function save_routine() {
  console.log('save routine')
  if (g_current_record_data && g_dirty) {
    g_dirty = false
    g_current_record_data.src_text = g_src_editor.getValue()
    g_current_record_data.des_text = g_des_editor.getValue()
    electron.ipcRenderer.send('update-record-data', g_current_record_data)
    console.log('saved')
  }
}
window.onbeforeunload = function () {
  console.log("try save before close")
  save_routine()
  store.set('width', window.innerWidth)
  store.set('height', window.innerHeight)
}

function find_top_2_filled_line(model) {
  let ret = [null, null]
  for (let i = 1; i <= model.getLineCount(); i++) {
    let line = model.getLineContent(i).trim()
    console.log('line', i, line)
    if (line.length != 0) {
      if (ret[0] == null) {
        ret[0] = line
      } else {
        ret[1] = line
        break
      }
    }
  }
  console.log('top2', ret)
  return ret
}

function notnull(s) {
  return s == null ? '' : s
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
        let top2 = find_top_2_filled_line(src_model)
        let new_title = rmmd.rmmd(notnull(top2[0]), true)
        let new_desc = rmmd.rmmd(notnull(top2[1]), true)
        if (g_current_record_data.src_title != new_title) {
          g_current_record_data.src_title = new_title
          on_selected_record_title_data_changed()
        }
        if (g_current_record_data.src_desc != new_desc) {
          g_current_record_data.src_desc = new_desc
          on_selected_record_desc_data_changed()
        }
      }
    })
  })

  let des_model = g_des_editor.getModel()
  des_model.onDidChangeContent(function (e) {

    if (g_selected_record_element == null) {
      return
    }
    g_dirty = true

    e.changes.forEach(function (change) {
      if (change.range.startLineNumber < 5) {
        let top2 = find_top_2_filled_line(des_model)
        let new_title = rmmd.rmmd(notnull(top2[0]), true)
        let new_desc = rmmd.rmmd(notnull(top2[1]), true)
        if (g_current_record_data.des_title != new_title) {
          g_current_record_data.des_title = new_title
          on_selected_record_title_data_changed()
        }
        if (g_current_record_data.des_desc != new_desc) {
          g_current_record_data.des_desc = new_desc
          on_selected_record_desc_data_changed()
        }
      }
    })
  })

  init_context_acions()

  // scroll sync
  $('#src_editor').click(function () {
    if (!g_des_editor.isFocused()) {
      g_des_editor.revealLineInCenterIfOutsideViewport(g_src_editor.getPosition().lineNumber)
      g_des_editor.setSelection(g_src_editor.getSelection())
    }
  })
  $('#des_editor').click(function () {
    if (!g_src_editor.isFocused()) {
      g_src_editor.revealLineInCenterIfOutsideViewport(g_des_editor.getPosition().lineNumber)
      g_src_editor.setSelection(g_des_editor.getSelection())
    }
  })
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
  g_src_editor.addAction({
    id: 'myact-search',
    label: 'Google It',
    precondition: null,
    keybindingContext: null,
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.5,
    run: function (ed) {
      let selected_text = g_src_editor.getModel().getValueInRange(g_src_editor.getSelection())
      console.log('selected', selected_text)

      utils.google(selected_text)
      return null;
    }
  })

  g_des_editor.addAction({
    id: 'myact-search',
    label: 'Google It',
    precondition: null,
    keybindingContext: null,
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.5,
    run: function (ed) {
      let selected_text = g_des_editor.getModel().getValueInRange(g_des_editor.getSelection())
      console.log('selected', selected_text)

      utils.google(selected_text)
      return null;
    }
  })

  // translate to clipboard

  g_src_editor.addAction({
    id: 'myact-translate',
    label: 'Copy and Translate',
    precondition: null,
    keybindingContext: null,
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.6,
    run: function (ed) {
      let selected_text = g_src_editor.getModel().getValueInRange(g_src_editor.getSelection())
      console.log('selected', selected_text)

      g_translating_src_lines = selected_text.split('\n')
      g_translating_line_index = 0
      g_translating_is_for_all = false
      g_translating_for_copy_cache = ''
      trans_next_line()
      return null;
    }
  })
}

function on_selected_record_title_data_changed() {
  g_selected_record_element.find('.record-title').text(right_showing_title(g_current_record_data))
}

function on_selected_record_desc_data_changed() {
  g_selected_record_element.find('.record-desc').text(right_showing_desc(g_current_record_data))
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

electron.ipcRenderer.on('cmd-select-target', function (e, data) {
  on_select_target(data)
  $('#target_list').scrollTo(g_target_map[data])
})

electron.ipcRenderer.on('cmd-select-record', function (e, data) {
  on_select_record(data)
  $('#records_space').scrollTo(g_record_map[data])
})

electron.ipcRenderer.on('cmd-toggle-preview', function(e, data) {
  if ($('#btn_markdown').attr('pressed') == "true"){
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

let g_translating_src_lines = null
let g_translating_line_index = 0
let g_translating_in_code = false
let g_translating_is_for_all = false
let g_translating_for_copy_cache = ''
function on_click_translate() {

  // because of undo, no need of check if des has data

  if (g_selected_record_element == null) {
    // no selected
    return
  }

  // clear des, can undo
  g_des_editor.executeEdits("", [
    {
      range: g_des_editor.getModel().getFullModelRange(),
      text: ''
    }
  ])

  // translate in lines
  g_translating_src_lines = g_src_editor.getModel().getLinesContent()
  g_translating_line_index = 0
  g_translating_is_for_all = true
  trans_next_line()
}

function trans_next_line() {
  let target_line = g_translating_src_lines[g_translating_line_index]

  // check empty line
  if (target_line.trim().length == 0) {
    on_line_translate_end('')
    return
  }

  // retain code block
  if (target_line.includes('```') || target_line.includes('~~~')) {
    g_translating_in_code = !g_translating_in_code
    on_line_translate_end(target_line)
    return
  } else if (g_translating_in_code) {
    on_line_translate_end(target_line)
    return
  }

  let unmarked = rmmd.rmmd(target_line).split(rmmd.SP)

  unmarked.filter((v) => v.length > 0)

  let trans_count = 0

  unmarked.forEach(function (segment) {
    if (segment.startsWith(rmmd.UN)) {
      // inline code, not translate
      trans_count += 1
      if (trans_count == unmarked.length) {
        on_line_translate_end(target_line)
      }
    } else {
      trans.translate2cn(segment, function (tred_text) {
        console.log(tred_text)
        tred_text = tred_text ? tred_text.to_text : segment
        target_line = target_line.replace(segment, tred_text)
        trans_count += 1
        if (trans_count == unmarked.length) {
          on_line_translate_end(target_line)
        }
      })
    }
  })
}

function on_line_translate_end(line_translate_result) {

  g_translating_line_index += 1
  if (g_translating_is_for_all) {
    g_src_editor.revealLine(g_translating_line_index)
    g_des_editor.revealLine(g_translating_line_index)

    let end_range = g_des_editor.getModel().getFullModelRange()
    end_range.startColumn = end_range.endColumn
    end_range.startLineNumber = end_range.endLineNumber

    g_des_editor.executeEdits("", [
      {
        range: end_range,
        text: line_translate_result + '\n'
      }
    ])
  } else {
    g_translating_for_copy_cache += line_translate_result
  }

  if (g_translating_line_index == g_translating_src_lines.length) {
    // translating done
    g_translating_src_lines = null
    g_translating_line_index = -1
    if (!g_translating_is_for_all) {
      electron.clipboard.writeText(g_translating_for_copy_cache)
      g_translating_for_copy_cache = ''
    }
    console.log('translating done')
  } else {
    trans_next_line()
  }

}

function on_click_btn_markdown() {
  $('#btn_markdown').attr('pressed', 'true')
  $('#btn_preview').attr('pressed', 'false')

  $('#editor_space').show()
  $('#preview').hide()
}

function on_click_btn_preview() {
  $('#btn_markdown').attr('pressed', 'false')
  $('#btn_preview').attr('pressed', 'true')

  $('#preview').html(markdown.toHTML(g_des_editor.getValue()))

  $('#preview a').each(function (index, element) {
    $(element).attr('target', '_blank')
  })

  $('#editor_space').hide()
  $('#preview').show()
}

function on_click_btn_mdguide() {
  if ($('#btn_mdguide').attr('pressed') == 'true') {
    $('#btn_mdguide').attr('pressed', 'false')
    $('#side').hide()
    g_side_width = 0
    update_editor_layout()
    store.set('mdguide', false)
    $('#btn_export').css('margin-right', '1px') //work round!!
  } else {
    $('#btn_mdguide').attr('pressed', 'true')
    $('#side').show()
    g_side_width = $('#side').width()
    update_editor_layout()
    store.set('mdguide', true)
    $('#btn_export').css('margin-right', '9px') //work round!!
  }
}

function on_click_on_info() {

  $('#info_wc_src').text('' + wc(g_src_editor.getValue()))
  $('#info_wc_des').text('' + wc(g_des_editor.getValue()))

  $('#info_pc_src').text('' + g_src_editor.getModel().getLineCount())
  $('#info_pc_des').text('' + g_des_editor.getModel().getLineCount())

  $('#info_create_time').text(moment.unix(g_current_record_data.create_time / 1000).fromNow())
  $('#info_edit_time').text(moment.unix(g_current_record_data.edit_time / 1000).fromNow())

  $('#article_info_dialog').modal('show')
}

function on_click_toggle_targets() {
  store.set('target_space', !store.get('target_space', true))
  reset_target_space_width()
}

function reset_target_space_width() {
  let flag = store.get('target_space', true)
  $('#window_header').css('grid-template-columns', flag ? '150px 200px 1fr 1fr':'80px 120px 1fr 1fr')
  $('#total').css('grid-template-columns', flag ? '150px 200px 1fr auto':'0px 200px 1fr auto')
  if (flag) {
    $('#show_icon').hide()
    $('#hide_icon').show()
  } else {
    $('#show_icon').show()
    $('#hide_icon').hide()
  }
  update_editor_layout()
}