const Analytics = require("analytics-node");
const analytics = new Analytics("<INSERT_SEGMENT_KEY>", { flushAt: 1 });

const track = (command, props) => {
	analytics.track({
		userId: "anonymous",
		event: command,
		properties: props
	});
};

module.exports = {
	track
};
