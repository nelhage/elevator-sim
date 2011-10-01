if(window.Prototype) {
    delete Object.prototype.toJSON;
    delete Array.prototype.toJSON;
    delete Hash.prototype.toJSON;
    delete String.prototype.toJSON;
}

window.onload = function () {
    DNode.connect({
      reconnect: 100
    }, function (remote) {
        remote.register(function (data, opts) {
            Flotr.draw($('plot'), data, opts);
        });
    });
};
