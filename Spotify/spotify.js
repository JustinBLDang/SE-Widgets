let fieldData;
let apiToken;

const mainContainer = document.getElementById('main-container');

window.addEventListener('onWidgetLoad', function (obj) {
    /* 
        set up spotify widget here. Since widget does not interact with stream,
        no need to use obj.
    */ 
    fieldData = obj.detail.fieldData;
    apiToken = obj.detail.channel.apiToken;
});