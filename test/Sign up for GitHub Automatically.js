var bbj = require('../lib/blinkblink.js')

var options = {
    app: {
        command: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
    }
}

var main_win = bbj.open('https://github.com/join', 'main', '', options)
main_win.on('main', function (blink) {
    blink.on('ready', function() {
        blink.blink(spy)
    })
    blink.on('load', function() {
    })
})

function spy () {
    console.blink = function (event, message) {
        console.log(event + '+_+' + message)
    }
	var user_login = document.querySelector('#user_login')
	var user_email = document.querySelector('#user_email')
	var user_password = document.querySelector('#user_password')
	var user_password_confirmation = document.querySelector('#user_password_confirmation')
	var signup_button = document.querySelector('#signup_button')

	if(user_login && user_email && user_password && user_password_confirmation && signup_button) {
		var user = Math.random().toString(35).slice(2, 20)
		var password = Math.random().toString(35).slice(2, 20)

		user_login.value = user
		user_email.value = user + '@gmail.com'
		user_password.value = password
		user_password_confirmation.value = password

		signup_button.click()
	}
}