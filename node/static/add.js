(function(){
	let socket = io();
    
    // Let server know client is ready for scan
	socket.emit("ready", "1");
	socket.on("scan", (uid) => { // On RFID scan, populate rfid field
		document.querySelector("input[name=rfid]").value = uid;
	});
}());
