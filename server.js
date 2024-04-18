require('dotenv').config()
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const clientSessions = require('client-sessions');
const {createServer} = require("http");
const { Server } = require('socket.io');

let Schema = mongoose.Schema;
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

const UserSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    contacts: [{
        type: Schema.Types.ObjectId, 
        ref: 'User'
    }]
});

const RoomSchema = new Schema({
    first: {
        type: Schema.Types.ObjectId, 
        required: true,
        ref: 'User'
    },
    second: {
        type: Schema.Types.ObjectId, 
        required: true,
        ref: 'User'
    }
});

const MessageSchema = new Schema({
    msg: {
        type: String,
        required: true
    },
    time: Date,
    from: {
        type: Schema.Types.ObjectId, 
        required: true,
        ref: 'User'
    },
    to: {
        type: Schema.Types.ObjectId, 
        required: true,
        ref: 'User'
    }
});

const User = mongoose.model('User', UserSchema);

const Message = mongoose.model('Message', MessageSchema);

const Room = mongoose.model('Room', RoomSchema);

io.on('connection', (socket) => {
    console.log('a user connected', socket.handshake.query.user, socket.handshake.query.friend);
    let room;

    Room.findOne({$or:[{first: socket.handshake.query.user, second: socket.handshake.query.friend}, {first: socket.handshake.query.friend, second: socket.handshake.query.user}]}).then(data => {
        socket.join(data._id.toString());
        room = data._id.toString();
    }).catch(err => {
        socket.emit('error', err);
    });

    socket.on('chat-message', (msg, time, from, to) => {
        console.log(msg, time, from, to);
        Message.create({
            msg: msg,
            time: time,
            from: from,
            to: to
        }).then(() => {
            io.to(room).emit('message-received', msg, from);
        }).catch(err => {
            socket.emit('error', err);
        }); 
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

app.get('/user', userLoggedIn, async (req, res) => {
    try {
        await User.findOne({_id: req.session.user}).then(data => {
            return Promise.all(data.contacts.map(ele => User.find({_id: ele})));
        }).then(contacts => {
            res.render("user", {cont: contacts});
        });
    } catch (err) {
        res.redirect(`/error?status=500&msg=${err}`);
    }
});

app.get('/user/chatRoom/:friendId', userLoggedIn, async (req, res) => {
    try {
        await Message.find({$or:[{from: req.session.user, to: req.params.friendId}, {from: req.params.friendId, to: req.session.user}]}).sort({time: 1}).then(messages => {
            // console.log(messages, req.session.user, req.params.friendId);
            res.render('chatRoom', {messages, to: req.params.friendId});
        });
    } catch(err) {
        res.redirect(`/error?status=500&msg=${err}`);
    }
});

app.get('/logout', userLoggedIn, (req, res) => {
    req.session.reset();
    res.redirect("/");
});

app.get('/user/addContacts', userLoggedIn, (req, res) => {
    res.render("form", {action: "/user/addContacts"});
});

app.get('/login', userNotLoggedIn, (req, res) => {
    res.render("form", {action: "/login"});
});

app.get('/signup', userNotLoggedIn, (req, res) => {
    res.render("form", {action: "/signup"});
});

app.use(bodyParser.urlencoded({extended: false}));

app.post('/user/addContacts', userLoggedIn, async (req, res) => {
    try {
        await User.findOne({name: req.body.username}).then(data => {
            if (data === null) {
                res.redirect('/error?status=404&msg=User does not exist');
            }
            else {
                User.findOne({_id: req.session.user }).then(data1 => { 
                    if (data1._id.toString() == data._id.toString()) {
                        res.redirect('/error?status=500&msg=User cannot add itself to contact');
                    }
                    else if (data1.toObject().contacts.map(ele => ele.toString()).includes(data._id.toString())) {
                        res.redirect('/error?status=500&msg=User cannot add a contact which already exists in contact');
                    }
                    else {
                        Room.findOne({$or:[{first: req.session.user, second: data._id}, {first: data._id, second: req.session.user}]}).then(data2 => {
                            console.log(data2);
                            return new Promise((resolve, reject) => {
                                if (data2) {
                                    resolve();
                                }
                                else {
                                    Room.create({
                                        first: req.session.user,
                                        second: data._id
                                    }).then(() => {
                                        resolve();
                                    }).catch(err => {
                                        reject(err)
                                    }); 
                                }
                            })
                        }).then(() => {
                            User.updateOne({_id: req.session.user}, {contacts: [...data1.toObject().contacts, data.toObject()._id]}).then(() => {
                                res.redirect('/user');
                            });
                        }).catch(err => {
                            res.redirect(`/error?status=500&msg=${err}`);
                        })
                    }
                });
            }
        })
    } catch(err) {
        res.redirect(`/error?status=500&msg=${err}`);
    }
});

app.post('/login', userNotLoggedIn, async (req, res) => {
    try {
        await User.findOne({name: req.body.username}).then(data => {
            if (data === null) {
                res.redirect('/error?status=404&msg=User does not exist');
            } else {
                req.session.user = data._id;
                res.redirect(`/user`);
            }
        });
    } catch (err) {
        res.redirect(`/error?status=500&msg=${err}`);
    }
});

app.post('/signup', userNotLoggedIn, async (req, res) => {
    if (req.body.username && req.body.username != "") {
        try {
            await User.create({
                name: req.body.username,
                contacts: []
            }).then((data) => {
                req.session.user = data._id;
                res.redirect(`/user`);
            });
        } catch(err) {
            res.redirect(`/error?status=500&msg=${err}`);
        }
    }
});

app.use((req, res, next) => {
    res.redirect("/error?status=404&msg=404 - We're unable to find what you're looking for.");
});

mongoose.connect(process.env.URI).then(() => {
    server.listen(HTTP_PORT, () => {
      console.log(`server listening on: ${HTTP_PORT}`);
    });
}).catch(err => {
    console.log(err);
});