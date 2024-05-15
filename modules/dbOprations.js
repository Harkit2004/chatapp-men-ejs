require('dotenv').config()
const mongoose = require("mongoose");
let Schema = mongoose.Schema;

const UserSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    rooms: [{
        type: Schema.Types.ObjectId, 
        ref: 'Room'
    }]
});

const RoomSchema = new Schema({
    name: String,
    members: [{
        type: Schema.Types.ObjectId, 
        required: true,
        ref: 'User'
    }]
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
        ref: 'Room'
    }
});

const User = mongoose.model('User', UserSchema);

const Message = mongoose.model('Message', MessageSchema);

const Room = mongoose.model('Room', RoomSchema);

const connect = () => {
    return new Promise((resolve, reject) => {
        mongoose.connect(process.env.URI).then(() => {
            resolve();
        }).catch(err => {
            reject(err);
        })
    });
}

const createUser = (userName) => {
    return new Promise((resolve, reject) => {
        User.create({
            name: userName,
            rooms: []
        }).then(data => {
            resolve(data);
        }).catch(err => {
            reject(err);
        });
    });
}

const userExistByName = (userName) => {
    return new Promise((resolve, reject) => {
        User.findOne({name: userName}).then(data => {
            if (data === null) {
                reject('User does not exist');
            } else {
                resolve(data);
            }
        }).catch(err => {
            reject(err);
        });
    });
}

const getRoomsByUserId = (id) => {
    return new Promise((resolve, reject) => {
        User.findOne({_id: id}).then(data => {
            return Promise.all(data.rooms.map((ele) => Room.find({_id: ele})));
        }).then(rooms => {
            return Promise.all(rooms.map(room => {
                // console.log(room[0]);
                return new Promise((resolve, reject) => {
                    if (room[0].name === null) {
                        getUserNameById(room[0].members.filter(ele => ele != id)[0]).then(name => {
                            room[0].name = name;
                            resolve(room[0]);
                        }).catch(err => {
                            reject(err);
                        });
                    } else {
                        resolve(room[0]);
                    }
                });
            }));
        }).then(rooms => {
            resolve(rooms);
        }).catch(err => {
            reject(err);
        });
    });
} 

const getRoomMessages = (roomId) => {
    return new Promise((resolve, reject) => {
        Message.find({to: roomId}).sort({time: 1}).then(messages => {
            console.log(messages);
            return Promise.all(messages.map(msg => {
                return new Promise((resolve, reject) => {
                    getUserNameById(msg.from).then(name => {
                        resolve({msg: msg.msg, time: msg.time, from: msg.from, name});
                    }).catch(err => {
                        reject(err);
                    })
                });
            }));
        }).then(messages => {
            resolve(messages);
        }).catch(err => {
            reject(err);
        });
    });
}

const getRoom = (userList) => {
    return new Promise((resolve, reject) => {
        Room.findOne({members: {$all: userList}}).then(data => {
            resolve(data);
        }).catch(err => {
            reject(err);
        });
    });
}

const addRoom = (userList, roomName) => {
    return new Promise(async (resolve, reject) => {
        try {
            let room = await Room.findOne({members: {$all: userList}});
            if (room === null) {
                let newRoom = await Room.create({
                    name: roomName,
                    members: userList
                });
                userList.forEach(async ele => {
                    try {
                        await User.updateOne({_id: ele}, {$push: {rooms: newRoom._id}});
                    }
                    catch (err) {
                        reject(err);
                    }
                });
                await newRoom.save();
                resolve();
            } 
            else {
                reject('A grp/contact with the users specified exist');
            }
        } 
        catch (err) {
            reject(err);
        }
    }); 
}

const createMessage = (message, time, roomId, userId) => {
    return new Promise((resolve, reject) => {
        Message.create({
            msg: message,
            time: time,
            from: userId,
            to: roomId
        }).then(data => {
            resolve(data);
        }).catch(err => {
            reject(err);
        });
    });
}

const getUsersOtherThanId = (id) => {
    return new Promise((resolve, reject) => {
        User.find({_id: {$ne: id}}).then(data => {
            resolve(data);
        }).catch(err => {
            reject(err);
        })   
    });
}

const getUserNameById = (id) => {
    return new Promise((resolve, reject) => {
        User.findOne({_id: id}).then(data => {
            resolve(data.name);
        }).catch(err => {
            reject(err);
        })
    });
}

module.exports = {connect, createUser, createMessage, userExistByName, getRoom, getRoomMessages, getRoomsByUserId, addRoom, getUsersOtherThanId, getUserNameById};
