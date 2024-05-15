require('dotenv').config()
const dbOps = require("./modules/dbOprations")
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const clientSessions = require('client-sessions');
const {createServer} = require("http");
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);
const HTTP_PORT = process.env.PORT || 8080;

const userLoggedIn = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/error?status=500&msg=Cannot access route when user is not logged in');
    }
}

const userNotLoggedIn = (req, res, next) => {
    if (!req.session.user)  {
        next();
    } else {
        res.redirect('/error?status=500&msg=Cannot access route when user logged in');
    }
}

io.on('connection', (socket) => {
    let user = socket.handshake.query.user;
    let room = socket.handshake.query.room;
    console.log('a user connected', user, room);

    socket.join(room);

    socket.on('chat-message', (msg, time) => {
        dbOps.createMessage(msg, time, room, user).then(msg => {
            dbOps.getUserNameById(user).then(name => {
                io.to(room).emit('message-received', msg, user, name);
            }).catch(err => {
                socket.emit('error', err);
            })
        }).catch(err => {
            socket.emit('error', err);
        })
    });

    socket.on('disconnect', () => {
        socket.leave(room);
    });
});


app.set('view engine', 'ejs');

app.use(express.static("public"));

app.use(
    clientSessions({
        cookieName: 'session', // this is the object name that will be added to 'req'
        secret: 'o6LjQ5EVNC28ZgK64hDELM18ScpFQr', // this should be a long un-guessable string.
        duration: 7 * 24 * 60 * 60 * 1000, // duration of the session is a week
        activeDuration: 1000 * 60 * 60, // the session will be extended by 1 hour
    })
);

app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

app.get('/', (req, res) => {
    res.render("index");
});

app.get('/error', (req, res) => {
    if (req.query.status && req.query.msg) {
        res.status(parseInt(req.query.status)).render("error", {status: parseInt(req.query.status), msg: req.query.msg});
    }
});

app.get('/user', userLoggedIn, (req, res) => {
    dbOps.getRoomsByUserId(req.session.user).then(rooms => {
        // console.log(rooms);
        res.render('user', {rooms});
    }).catch(err => {
        res.redirect('/error?status=500&msg=' + err);
    });
});

app.get('/login', userNotLoggedIn, (req, res) => {
    res.render("form", {action: "/login"});
});

app.get('/signup', userNotLoggedIn, (req, res) => {
    res.render("form", {action: "/signup"});
});

app.get('/logout', userLoggedIn, (req, res) => {
    req.session.reset();
    res.redirect("/");
});

//
app.get('/user/chatRoom/:roomId', userLoggedIn, (req, res) => {
    dbOps.getRoomMessages(req.params.roomId).then(messages => {
        console.log(messages);
        res.render('chatRoom', {messages, to: req.params.roomId});
    }).catch(err => {
        res.redirect('/error?status=500&msg=' + err);
    });
});

app.get('/user/addContacts', userLoggedIn, (req, res) => {
    dbOps.getUsersOtherThanId(req.session.user).then(users => {
        res.render("addContacts", {action: "/user/addContacts", users: JSON.stringify(users.map(ele => { return {_id: ele._id, name: ele.name}; }))});
    }).catch(err => {
        res.redirect('/error?status=500&msg=' + err);
    });
});

app.use(bodyParser.urlencoded({extended: false}));

app.post('/user/addContacts', userLoggedIn, (req, res) => {
    // console.log(req.body);
    let obj = req.body;
    let grpName = obj['grp-name'];
    delete obj['grp-name'];
    let users = [...Object.values(obj)];
    let userSet = new Set(users);
    // console.log(users, userSet, users.length, userSet.size);
    if (users.length !== 0 && users.length === userSet.size) {
        if (users.length === 1) {
            dbOps.addRoom([...users, req.session.user], null).then(() => {
                res.redirect('/user');
            }).catch(err => {
                res.redirect('/error?status=500&msg=' + err);
            });
        }
        else if (grpName && grpName.length !== 0) {
            dbOps.addRoom([...users, req.session.user], grpName).then(() => {
                res.redirect('/user');
            }).catch(err => {
                res.redirect('/error?status=500&msg=' + err);
            });
        }
        else {
            res.redirect('/error?status=500&msg=No grp can be created with a empty name');
        }
    } else {
        res.redirect('/error?status=500&msg=No adding a user more than once/No empty grps');
    }
});

app.post('/login', userNotLoggedIn, (req, res) => {
    dbOps.userExistByName(req.body.username).then(data => {
        req.session.user = data._id;
        res.redirect(`/user`);
    }).catch(err => {
        res.redirect('/error?status=500&msg=' + err);
    });
});

app.post('/signup', userNotLoggedIn, (req, res) => {
    if (req.body.username && req.body.username != "") {
        dbOps.createUser(req.body.username).then(data => {
            req.session.user = data._id;
            res.redirect(`/user`);
        }).catch(err => {
            res.redirect('/error?status=500&msg=' + err);
        });
    }
});

app.use((req, res, next) => {
    res.redirect("/error?status=404&msg=404 - We're unable to find what you're looking for.");
});

dbOps.connect().then(() => {
    server.listen(HTTP_PORT, () => {
        console.log(`server listening on: ${HTTP_PORT}`);
    });
}).catch(err => {
    console.log(err);
});