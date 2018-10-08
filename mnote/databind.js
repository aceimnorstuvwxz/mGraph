const electron = require('electron')
const Store = require('electron-store')
const store = new Store()

//自动绑定设置项到数据存储
exports.autobind = ()=>{
    $('.autobind').each((index, element)=>{
        console.log(element)
        jele = $(element);
        let name = element.id;
        element.value = store.get(name, element.getAttribute('dft'));
        jele.change(()=>{
            store.set(name, element.value);
            electron.ipcRenderer.send('databind-change', name);
        })
    })
}