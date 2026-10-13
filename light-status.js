(function(){
var root=document.documentElement;
function show(s){root.setAttribute('data-light',s);}
window.aypekLight={red:function(){show('orange');},orange:function(){show('orange');},fail:function(){show('red');},unverified:function(){show('unverified');},confirmNative:function(status){if(status==='ready'||status==='busy')show('blue');else show('unverified');}};
show('orange');
})();