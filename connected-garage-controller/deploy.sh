#ssh pi@$2 "sudo systemctl stop pi-controller"
scp target/armv7-unknown-linux-gnueabihf/$1/connected-garage-controller pi@$2:~/connected-garage/connected-garage-controller
scp AppSettings.toml pi@$2:~/connected-garage/AppSettings.toml

#ssh pi@$2 "sudo systemctl start pi-controller"