
const Store = require('electron-store');
const store = new Store();

//common data interface


exports.get_targets = ()=>{
    return store.get('targets', [])
}

exports.set_targets = (targets)=>{
    return store.set('targets', targets)
}

exports.add_target = (target)=>{
    let tmp = exports.get_targets()
    tmp.push(target)
    exports.set_targets(tmp)
}

exports.remove_target = (target)=>{
    let tmp = exports.get_targets()
    tmp = tmp.filter((v)=>{return v!=target})
    exports.set_targets(tmp)
}

exports.get_tags = ()=>{
    return store.get('tags', [])
}
exports.set_tags = (tags)=>{
    store.set('tags', tags)
}
exports.add_tag = (tag_name)=>{
    let tags = exports.get_tags()
    if (tags.indexOf(tag_name) == -1) {
        tags.push(tag_name)
        exports.set_tags(tags)
        return true
    } else {
        return false
    }
}

exports.remove_tag = (tag_name)=>{
    let tags = exports.get_tags()
    tags = tags.filter(tag=>{return tag!=tag_name})
    exports.set_tags(tags)
}