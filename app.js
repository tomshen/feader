var express = require('express'),
    request = require('request'),
    feedparser = require('feedparser'),
    cons = require('consolidate'),
    path = require('path'),
    http = require('http');

var app = express();
var port = process.env.PORT || 5000;

app.use(express.logger());

// assign the swig engine to .html files
app.engine('html', cons.swig);

// set .html as the default extension 
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

app.configure(function () {
  app.set("view options", { layout: false });
  app.use(express.bodyParser());
  app.use('/static', express.static(path.join(__dirname, 'static')));
});

function get_feed(url, callback) {
  var data = {
    meta: null,
    articles: []
  };
  var err;
  request(url)
    .pipe(new feedparser())
    .on('error', function(error) {
      console.error(error);
      err = error;
    })
    .on('meta', function (meta) {
      data.meta = meta;
    })
    .on('readable', function () {
      var stream = this, item;
      while(item = stream.read()) {
        data.articles.push(item);
      }
      if(data.articles.length >= 10)
        return callback(err, data);
    });
  
}

app.get('/', function(req, res){
  res.render('index');
});

app.get('/feed', function(req, res){
  get_feed(req.query.url, function(err, feed) {
    if(err) res.send(err);
    res.render('feed', feed);
  });
});

app.listen(port, function() {
  console.log("Listening on " + port);
});