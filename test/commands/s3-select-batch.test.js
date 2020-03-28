const _ = require("lodash");
const { expect, test } = require("@oclif/test");
const AWS = require("aws-sdk");
const Promise = require("bluebird");
const fs = require("fs");

const mockListObjects = jest.fn();
AWS.S3.prototype.listObjectsV2 = mockListObjects;
const mockSelectObjectContent = jest.fn();
AWS.S3.prototype.selectObjectContent = mockSelectObjectContent;
const mockOpenSync = jest.spyOn(fs, "openSync");
const mockCloseSync = jest.spyOn(fs, "closeSync");
const mockWriteSync = jest.spyOn(fs, "writeSync");

beforeEach(() => {
	mockListObjects.mockReset();
	mockSelectObjectContent.mockReset();
});

const commandArgs = [
	"s3-select-batch",
	"-b",
	"bucket-dev",
	"-r",
	"us-east-1",
	"-x",
	"my-folder/",
	"-e",
	"select * from s3object limit 1"
];

describe("select-s3-batch", () => {
	describe("when there are no objects", () => {
		beforeEach(() => {
			givenListObjectsReturns([]);
		});
    
		test.stdout()
			.command([...commandArgs, "-f", "CSV"])
			.it("skips the S3 Select altogether", ctx => {
				expect(ctx.stdout).to.contain("no objects found, skipped...");
				expectListObjectsToBeCalled();
			});
	});
  
	describe("when there are two objects", () => {
		const records = [{ id: 1 }, { id: 2 }, { id: 3 }];
    
		beforeEach(() => {
			givenListObjectsReturns([{
				Key: "object1",
				Size: 1024
			}, {
				Key: "object2",
				Size: 1024
			}]);
      
			givenSelectObjectContentReturns(records);
		});

		describe("when the objects are in JSON", () => {
			test.stdout()
				.command([...commandArgs, "-f", "JSON"])
				.it("runs S3 Select against the two objects", ctx => {
					expect(ctx.stdout).to.contain("all done!");
					expectListObjectsToBeCalled();
          
					expect(mockSelectObjectContent.mock.calls).to.have.lengthOf(2);        
					mockSelectObjectContent.mock.calls.forEach(([req]) => {
						expect(req.Bucket).to.equal("bucket-dev");
						expect(req.Expression).to.equal("select * from s3object limit 1");
						expect(req.ExpressionType).to.equal("SQL");
						expect(req.InputSerialization).to.eql({
							CompressionType: "NONE",
							JSON: {
								Type: "DOCUMENT"
							}
						});
						expect(req.OutputSerialization).to.eql({
							JSON: {}
						});
					});
          
					records.forEach(r => {
						expect(ctx.stdout).to.contain(JSON.stringify(r, null, 2));
					});
				});
		});
    
		describe("when the objects are in CSV", () => {
			test.stdout()
				.command([...commandArgs, "-f", "CSV"])
				.it("runs S3 Select against the two objects", ctx => {
					expect(ctx.stdout).to.contain("all done!");
					expectListObjectsToBeCalled();
          
					expect(mockSelectObjectContent.mock.calls).to.have.lengthOf(2);        
					mockSelectObjectContent.mock.calls.forEach(([req]) => {
						expect(req.Bucket).to.equal("bucket-dev");
						expect(req.Expression).to.equal("select * from s3object limit 1");
						expect(req.ExpressionType).to.equal("SQL");
						expect(req.InputSerialization).to.eql({
							CompressionType: "NONE",
							CSV: {}
						});
						expect(req.OutputSerialization).to.eql({
							CSV: {}
						});
					});
          
					records.forEach(r => {
						expect(ctx.stdout).to.contain(JSON.stringify(r, null, 2));
					});
				});
		});
    
		describe("when the objects are in Parquet", () => {
			test.stdout()
				.command([...commandArgs, "-f", "Parquet"])
				.it("runs S3 Select against the two objects", ctx => {
					expect(ctx.stdout).to.contain("all done!");
					expectListObjectsToBeCalled();
          
					expect(mockSelectObjectContent.mock.calls).to.have.lengthOf(2);        
					mockSelectObjectContent.mock.calls.forEach(([req]) => {
						expect(req.Bucket).to.equal("bucket-dev");
						expect(req.Expression).to.equal("select * from s3object limit 1");
						expect(req.ExpressionType).to.equal("SQL");
						expect(req.InputSerialization).to.eql({
							CompressionType: "NONE",
							Parquet: {}
						});
						expect(req.OutputSerialization).to.eql({});
					});
          
					records.forEach(r => {
						expect(ctx.stdout).to.contain(JSON.stringify(r, null, 2));
					});
				});
		});
    
		describe("when --outputFile is provided", () => {
			beforeEach(() => {
				// not sure why, but if I monkeypatch fs in global then all the tests
				// fail with "globby.sync is not a function"
				// hence why I'm monkeypatching in the test instead
				fs.openSync = mockOpenSync;
				fs.closeSync = mockCloseSync;
				fs.writeSync = mockWriteSync;
			});
      
			test.stdout()
				.command([...commandArgs, "-f", "JSON", "-o", "output.txt"])
				.it("writes the output to file instead", ctx => {
					expect(ctx.stdout).to.contain("all done!");
					expectListObjectsToBeCalled();
          
					expect(mockSelectObjectContent.mock.calls).to.have.lengthOf(2);       
					records.forEach(r => {
						expect(ctx.stdout).to.not.contain(JSON.stringify(r, null, 2));            
					});
          
					const openOutputTxt = _.find(
						mockOpenSync.mock.calls,
						([filename, flags]) => filename === "output.txt" && flags === "w");
					expect(openOutputTxt).to.not.be.undefined;
          
					const allWritten = _.sumBy(mockWriteSync.mock.calls, (params) => params[1]);
					records.forEach(r => {
						expect(allWritten).to.contain(JSON.stringify(r) + "\n");
					});
				});
		});
	});
});

function givenListObjectsReturns(objects, hasMore = false) {
	mockListObjects.mockReturnValueOnce({
		promise: () =>
			Promise.resolve({
				Contents: objects,
				ContinuationToken: hasMore ? "more" : null
			})
	});
}

function expectListObjectsToBeCalled() {
	expect(mockListObjects.mock.calls).to.have.lengthOf(1);
	const [req] = mockListObjects.mock.calls[0];
	expect(req.Bucket).to.equal("bucket-dev");
	expect(req.Prefix).to.equal("my-folder/");
}

function createAutoPlayStream(events) {
	let onData, onEnd;
	return {
		on: (event, cb) => {
			if (event === "data") {
				onData = cb;
			} else if (event === "end") {
				onEnd = cb;
			}
		},
		play: () => {
			events.forEach(e => onData(e));
			onEnd();
		}
	};
}

function givenSelectObjectContentReturns(records) {
	mockSelectObjectContent.mockReturnValue({
		promise: () => {
			const events = [{
				Records: {
					Payload: Buffer.from(JSON.stringify({
						Records: records
					}))
				}
			}];
			const stream = createAutoPlayStream(events);
			Promise.delay(500).then(() => stream.play());
			return Promise.resolve({
				Payload: stream
			});
		}			
	});
}
