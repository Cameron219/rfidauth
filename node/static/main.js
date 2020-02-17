(function(){
	let socket = io();
	let form = document.querySelector("form#login");
	let username = form.querySelector("input[name=username]");
	let password = form.querySelector("input[name=password]");
	let nfc_img = document.querySelector("img.nfc");

    // Catch form submit
	form.addEventListener("submit", (e) => {
        // Send Ajax Post request rather than submitting
		let post = new XMLHttpRequest();
		post.onreadystatechange = function(){
			if(post.readyState == 4){
				if(post.status == 200){
                    // Valid login
					if(post.responseText == 1){
						document.querySelector("div#nfc").style.display = "block";
						document.querySelector("div.container").style.display = "none";
					} else {
						alert("Invalid Credentials");
					}
				} else {
					console.error(post.status, "Error logging in");
				}
			}
		};
		post.open("POST", "login", true);
		post.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		post.send("username=" + username.value + "&password=" + password.value + "&socketid=" + socket.id);
        // Prevent form submission
		e.preventDefault();
	}, true);
	socket.on("scan", (status) => {
		if(status == 1){ // Valid scan
			nfc_img.src = "nfc-green.png";
			setTimeout(() => window.location.href='', 500);
		}
		else if (status == 0){ // Invalid Scan
			nfc_img.src = "nfc-red.png";
			setTimeout(() => nfc_img.src = "nfc.png", 2000);
		} else if(status == 2) { // 3rd attempt invalid scan
			nfc_img.src = "nfc-red.png";
			setTimeout(() => window.location.href = '', 2000);
		}
	});
}());
