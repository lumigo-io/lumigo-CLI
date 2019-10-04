const restify = require("restify");
const axios = require("axios");
const ngrok = require("ngrok");
require("colors");

const respond = (onConfirmed) => (req, res, next) => {
	const body = JSON.parse(req.body);
	if (body.Type === "SubscriptionConfirmation") {
		axios.get(body.SubscribeURL).then(() => {
			console.log("confirmed SNS subscription");
			onConfirmed();
      
			res.send(200);
			next();
		});
	} else {
		const timestamp = new Date().toJSON().grey.bold.bgWhite;
		console.log(timestamp, "\n", body.Message);
    
		res.send(200);
		next();
	}
};

const start = async (onConfirmed) => {
	const port = 8000 + Math.ceil(Math.random() * 1000);
	const url = await ngrok.connect(port);

	var server = restify.createServer();
	server.post("/", respond(onConfirmed));
  
	server.use(restify.plugins.bodyParser());

	server.listen(port, function() {
		console.log(`listening at ${url}`);
	});
  
	return {
		url,
		stop: async () => {
			console.log("stopping webserver...");
			server.close();
      
			console.log("terminating ngrok process...");
			await ngrok.kill();
		}
	};
};

module.exports = {
	start
};
