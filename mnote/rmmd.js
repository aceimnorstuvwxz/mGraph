//remove markdown?
//https://github.com/fateleak/remove-markdown

const SP = '@f4t3@'
const UN = 'un9t5ra'

module.exports.SP = SP
module.exports.UN = UN
module.exports.rmmd = function(md, nd= false, options=null) {
    let sp = nd ? '' : SP
    let un = nd ? '' : UN
    options = options || {};
    options.listUnicodeChar = options.hasOwnProperty('listUnicodeChar') ? options.listUnicodeChar : false;
    options.stripListLeaders = options.hasOwnProperty('stripListLeaders') ? options.stripListLeaders : true;
    options.gfm = options.hasOwnProperty('gfm') ? options.gfm : true;
  
    var output = md || '';
  
    // Remove horizontal rules (stripListHeaders conflict with this rule, which is why it has been moved to the top)
    output = output.replace(/^(-\s*?|\*\s*?|_\s*?){3,}\s*$/gm, sp);
  
    try {
      if (options.stripListLeaders) {
        if (options.listUnicodeChar)
          output = output.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, options.listUnicodeChar + ` ${sp}$1${sp}`);
        else
          output = output.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, `${sp}$1${sp}`);
      }
      if (options.gfm) {
        output = output
          // Header
          .replace(/\n={2,}/g, '\n')
          // Fenced codeblocks
          .replace(/~{3}.*\n/g, sp)
          // Strikethrough
          .replace(/~~/g, sp)
          // Fenced codeblocks
          .replace(/`{3}.*\n/g, sp);
      }
      output = output
        // Remove HTML tags
        .replace(/<[^>]*>/g, sp)
        // Remove setext-style headers
        .replace(/^[=\-]{2,}\s*$/g, sp)
        // Remove footnotes?
        .replace(/\[\^.+?\](\: .*?$)?/g, sp)
        .replace(/\s{0,2}\[.*?\]: .*?$/g, sp)
        // Remove images
        .replace(/\!\[.*?\][\[\(].*?[\]\)]/g, sp)
        // Remove inline links
        .replace(/\[(.*?)\][\[\(].*?[\]\)]/g, `${sp}$1${sp}`)
        // Remove blockquotes
        .replace(/^\s{0,3}>\s?/g, sp)
        // Remove reference-style links?
        .replace(/^\s{1,2}\[(.*?)\]: (\S+)( ".*?")?\s*$/g, sp)
        // Remove atx-style headers
        .replace(/^(\n)?\s{0,}#{1,6}\s+| {0,}(\n)?\s{0,}#{0,} {0,}(\n)?\s{0,}$/gm, sp + '$1$2$3' + sp)
        // Remove emphasis (repeat the line to remove double emphasis)
        .replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, `${sp}$2${sp}`)
        .replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, `${sp}$2${sp}`)
        // Remove code blocks
        .replace(/(`{3,})(.*?)\1/gm, `${sp}$2${sp}`)
        // Remove inline code
        .replace(/`(.+?)`/g, `${sp}${un}$1${sp}`)
        // Replace two or more newlines with exactly two? Not entirely sure this belongs here...
        .replace(/\n{2,}/g, '\n\n')
    } catch(e) {
      console.error(e);
      return md;
    }
    return output;
  };
  