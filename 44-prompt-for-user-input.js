var fs = require('fs');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
const port = 3978;
const BOT_URL = "https://directline.botframework.com/v3/directline/conversations";
const BOT_KEY = "DIRECTLINEKEY-AAAAAAAAAAAA-BBBBBBBBBB";
var request = require('request');
request.debug = true;

function optJSONString(json,key){
	if( json && key in json && json[key] != null && json[key].length > 0){
		return json[key];
	}
	return "";
}

function optJSONNumber(json,key){
	if( json && key in json && json[key] != null){
		return json[key];
	}
	return 0;
}

function clearCookie(http_res){
	http_res.clearCookie('azure_cnvid'); //delete sid
	http_res.clearCookie('azure_token'); //delete sid
	http_res.clearCookie('azure_watermark'); //delete sid
}

function errorAction(http_res,message){
	clearCookie(http_res);
	if(message === "Invalid token or secret"){
		createSession(http_res);
	}
	else{
		http_res.send('エラーが発生しました。恐れ入りますが暫く後、再度お試し下さい。');
	}
}

function createSession(http_res){
	request.post({
		url: BOT_URL,
		method: "POST",
		headers: {
			"Authorization": "Bearer " + BOT_KEY
		},
		json: true
	},(error, res, body) => {
		var ok = 0;
		if(error){
			console.log(error);
		}
		else{
    		console.log(JSON.stringify(body, null, 2));
			var conversationId = optJSONString(body,"conversationId");
			var token = optJSONString(body,"token");
			var expires_in = optJSONNumber(body,"expires_in");
			console.log("conversationId="+conversationId);
			console.log("token="+token);
			console.log("expires_in="+expires_in);
			if(conversationId.length > 0 && token.length > 0){
				ok = 1;
				http_res.cookie('azure_cnvid', conversationId, {maxAge:3600000, httpOnly:false});
				http_res.cookie('azure_token', token, {maxAge:3600000, httpOnly:false});
				sendMessage(null,http_res,conversationId,token,null);
			}
		}
		if( ok == 0 ){
			errorAction(http_res,"");
		}
	});
}

function sendMessage(http_req,http_res,azure_cnvid,azure_token,azure_watermark){

	var input_text = "Hello";
	if(http_req != null) input_text = http_req.body.user_input_ta;

	request.post({
		url: BOT_URL + "/" + azure_cnvid + "/activities",
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": "Bearer " + azure_token
		},
		json: {
			type: "message",
			from: { id: "user1" },
			text: input_text
		}
	},(error, res, body) => {
		if(error){
			console.log(error);
			errorAction(http_res,"");
		}
		else if(body && "error" in body){
			console.log(JSON.stringify(body, null, 2));
			errorAction(http_res,optJSONString(body.error,"message"));
		}
		else if(body){
			console.log(JSON.stringify(body, null, 2));

			request.get({
				url: BOT_URL + "/" + azure_cnvid + "/activities?watermark=" +
				(azure_watermark ? azure_watermark:"WATERMARK_STRING"),
				method: "GET",
				headers: {
					"Authorization": "Bearer " + azure_token
				},
				json: true
			},(error2, res2, body2) => {
				if(error2){
					console.log(error2);
					errorAction(http_res,"");
				}
				else if(body2 && "error" in body2){
					console.log(JSON.stringify(body2, null, 2));
					errorAction(http_res,optJSONString(body2.error,"message"));
				}
				else if(body2){
					console.log(JSON.stringify(body2, null, 2));
					var watermark = optJSONNumber(body2,"watermark");
					if( watermark > 0 ){
						http_res.cookie('azure_watermark', watermark + "", {maxAge:3600000, httpOnly:false});
					}
					var rtext = '';
					var pre_text = '';
					if( "activities" in body2 ){
						for(var i = 0; i < body2.activities.length; i++ ){
							var replyToId = optJSONString(body2.activities[i],"replyToId");
							var text = optJSONString(body2.activities[i],"text");
							if(replyToId.length > 0 && text.length > 0 && text !== pre_text){
								if(rtext.length > 0) rtext += '\n';
								rtext += text;
								pre_text = text;
							}
						}
					}
					if(rtext.length > 0){
						http_res.send(rtext.replace(/\n/g, '<br>'));
					}
					else{
						http_res.send("有効な回答を見つけられませんでした。");
					}
				}
			});
		}
	});
}

app.use(express.static('public'));

app.use(cookieParser());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

app.post('/chat-post', (http_req, http_res) => {
  console.log(http_req.body);

	var azure_cnvid = http_req.cookies.azure_cnvid;
	console.log("azure_cnvid="+azure_cnvid);

	var azure_token = http_req.cookies.azure_token;
	console.log("azure_token="+azure_token);

	var azure_watermark = http_req.cookies.azure_watermark;
	console.log("azure_watermark="+azure_watermark);

	if(azure_cnvid && azure_token){ //セッションidあり
		sendMessage(http_req,http_res,azure_cnvid,azure_token,azure_watermark);
	}
	else{
		createSession(http_res);
	}
});

app.get('/', (http_req, http_res) => {

	clearCookie(http_res);

    fs.readFile('./44-prompt-for-user-input.html', 'utf-8' , readcallback );
    function readcallback(err, data) {
        http_res.send(data);
    }

});

app.get('*', function(http_req, http_res) {
    http_res.redirect('/');
});

app.listen(port, () => console.log(`app listening on port ${port}!`))
