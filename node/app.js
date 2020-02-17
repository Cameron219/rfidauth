const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const app = express();
const mqtt = require("mqtt");
const http = require("http").createServer(app);
const io = require("socket.io")(http);

// Broker information
const broker_username = "xxxxx";
const broker_password = "xxxxxxxxxxx";
const port = 1234;

// Set up AWS SDK connection
const aws = require('aws-sdk');
aws.config.update({accessKeyId:'XXXXXXXXXXXXX', secretAccessKey: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXX', region:'eu-west-2'});
const snsPublish = require('aws-sns-publish');

let clients = [];

/* MySQL */
const mysql = require("mysql");
const conn = mysql.createConnection({
	host: "xxxxx",
	user: "xxxxx",
	password: "xxxxx",
	port: "1234",
	database: "xxxxx"
});


// Connect to DB
conn.connect((err) => {
	if(err) {
		console.error("Database connection failed: " + err.stack);
		return;
	}
	console.log("Connected to database.");
    // Test query
	conn.query("SELECT * FROM users", (err, result, fields) => {
		if(err) console.error(err.stack);
		else console.log(result);
	});
});

/* MQTT Client */
let client = mqtt.connect("mqtt://127.0.0.1", {username:broker_username,password:broker_password});
client.on("connect", () => console.log("Connected!"));
client.subscribe("rfid/read/+");

/* Node App */
app.use(express.urlencoded({extended: true}));
app.use(cookieParser());
app.set('view enging', 'ejs');
app.engine('html', require('ejs').renderFile);
app.use(session({secret: 'xxxxx',resave:true,saveUninitialized:true}));
app.use(express.static(__dirname + "/static"));
// Get index page
app.get("/", (req, res) => {
    // If logged in render user manage page
	if(req.session.username && req.session.rfid) {
		conn.query("SELECT * FROM users", (err, result, fields) => {
			if(err){
				console.error(err.stack);
				res.send("DB Error.");
			}
			else {
				console.log(result);
				res.render(__dirname + "/html/manage.html", {users : result});
			}
		});
		return;
	}
    // Else render login page
	res.sendFile(__dirname + "/html/login.html");
});
// Log out (remove session vars)
app.get("/logout", (req, res) => {
	req.session.destroy();
	res.redirect("/");
});
// Show form to add user
app.get("/add", (req, res) => {
    // Confirm user logged in
	if(req.session.username && req.session.rfid) {
        // Render HTML
		res.sendFile(__dirname + "/html/add.html");
		io.on("connection", (socket) => {
            // When client ready
			socket.on("ready", () => {
                // Enable RFID
				client.publish("rfid/enable/" + socket.id, "1");
                // Listen for RFID scans
				client.on("message", (topic, message) => {
					if(topic.indexOf("rfid/read/") == 0){
						let uid = message.toString();
                        // Send scan to client
						socket.emit("scan", uid);
					}
				});
			});
		});
	} else res.redirect("/");
});
// Add user
app.post("/add", (req, res) => {
    // Fail if not logged in
    if(!req.session.username || !req.session.rfid) return;
	let username = req.body.username,
	    password = req.body.password,
	    uid = req.body.rfid;

    // Check if user already exists
	conn.query("SELECT * FROM users WHERE username = ?", [username], (err, result, fields) => {
        // If no user exists with specified username
		if(result.length == 0) {
            // Get salt
			bcrypt.genSalt(10, (err, salt) => {
                // Hash password
				bcrypt.hash(password, salt, (err, hash) => {
					if(err) console.error(err);
					else {
                        // Add user to DB
						conn.query("INSERT INTO users (username, password, rfid) VALUES(?, ?, ?)", [username, hash, uid], (err, result) => {
							if(err) console.error(err);
							else {
								res.redirect("/");
							}
						});
					}
				});
			});
		} else res.send("User already exists");
	});
});
app.get("/delete", (req, res) => {
    // If logged in
	if(req.session.username && req.session.rfid) {
        // Get ID of user to be deleted
		let id = req.query.id;
		if(id > 1) { // If ID not admin, delete
			conn.query("DELETE FROM users WHERE id=?", [id], (err, result) => {
				if(err) console.error(err);
				else {
					res.redirect("/"); // Redirect to user page
				}
			});
		}
	} else res.redirect("/");
});
app.post("/login", (req, res) => {
	let username = req.body.username,
	    password = req.body.password,
	    socketid = req.body.socketid;
	
    // Check if user exists
	conn.query("SELECT * FROM users WHERE username = ?", [username], (err, result, fields) => {
		if(err) console.error(err.stack);
		else {
            // If user does exist
			if(result.length > 0){
				user = result[0];
				bcrypt.compare(password, user.password, (err, match) => {
                    // If passwords match
					if(match) {
						res.send("1"); // Tell client of sucesful login
						let attempts = 1; // Current # of scan attempts
                        // Enable RFID scanner
						client.publish("rfid/enable/" + socketid, "1");
                        // Listen for scans
						client.on("message", (topic, message) => {
							if(topic.indexOf("rfid/read/") == 0){
                                // If scanned UID matches stored UID
                                // Log in (sets session vars)
								let uid = message.toString();
								if(uid == user.rfid){
									io.to(socketid).emit("scan", 1);
									req.session.username = username;
									req.session.rfid = uid;
									req.session.save();
								} else {
                                    // If wrong and still has attempts left
									if(attempts < 3) {
										io.to(socketid).emit("scan", 0);
										attempts++;
										setTimeout(() => client.publish("rfid/enable/" + socketid, "1"), 2000);
									} else{
                                        // If wrong and hit 3 failed attempts
                                        // Send admin email
										let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;	
										io.to(socketid).emit("scan", 2);
										email("Failed Login", "Details:\nIP: " + ip + "\nUsername: " + username + "\nRFID UID: " + uid);
									}
								}
							}
						});
					} else res.send("0");
				});
			} else {
				console.log("No user found: " + username);
				res.send("0");
			}
		}
	});
});
// Create http server
http.listen(port, () => console.log("App listening on port " + port + "!"));

/* Socket.IO */
// Handle and store current socket connections
io.on("connection", (socket) => { 
	clients.push(socket.id);
	console.log("Connected: " + socket.id);
	socket.on("disconnect", () => {
		clients.splice(clients.indexOf(socket.id), 1);
		console.log("Disconnected: " + socket.id);
	});
});

// Send email via SNS
function email(subject, message) {
	snsPublish(message, {arn: 'xxxxx:FailedLogin', region: 'eu-west-2', subject: subject});
}
