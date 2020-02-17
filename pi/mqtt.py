import paho.mqtt.client as mqtt
import RPi.GPIO as GPIO
from mfrc522 import SimpleMFRC522
import wiringpi

reader = SimpleMFRC522()
# Broker Information
broker_ip = "xxx.xxx.xxx.xxx"
broker_port = 1234
broker_username = "xxxxx"
broker_password = "xxxxxxxxxxxx"

# Topic Information
topic = "rfid"

# On connection to broker
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        # Subscribe to relevant topics
        client.subscribe("rfid/enable/+")
        print "Connection to broker successful!"
    else: # Error connecting to broker
        error_message = "Connection refused - "
        if(rc == 1):
            error_message += "incorrect protocol version"
        elif (rc == 2):
            error_message += "invalid client identifier"
        elif (rc == 3):
            error_message += "server unavailable"
        elif (rc == 4):
            error_message += "bad username or password"
        elif (rc == 5):
            error_message += "not authorised"
        else:
            error_message += "Unknown"
        print "(" + str(rc) + ") " + error_message


# When a subscribed topic recieves a message
def on_message(client, userdata, msg):
    print "Topic: " + msg.topic + "\nMessage:\n" + str(msg.payload)
    # If server has enabled scan
    if msg.topic.index("rfid/enable/") == 0:
        # Get socket id of client that enabled scan
        socket_id = msg.topic[msg.topic.rindex("/")+1:]
        print(socket_id)
        # Set up and set high GPIO pin # 20
        wiringpi.wiringPiSetupGpio()
        wiringpi.pinMode(20, 1)
        wiringpi.digitalWrite(20, 1)
        id, text = reader.read_no_block()
        while not id:
            id, text = reader.read_no_block()
        #Turn off GPIO pin # 20
        wiringpi.digitalWrite(20, 0)
        print(id)
        print(text)
        # Publish scan back to server
        client.publish("rfid/read/" + socket_id, str(id))



# Connect to the broker
def connect(client):
    client.on_connect = on_connect
    client.on_message = on_message
    client.username_pw_set(username=broker_username, password=broker_password)
    client.connect(broker_ip, broker_port)
    client.loop_forever()


def main():
    client = mqtt.Client()
    connect(client)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        GPIO.cleanup()
