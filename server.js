const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

// Express uygulamasını oluştur
const app = express();

// Statik dosyaları servis et
app.use(express.static(path.join(__dirname, 'public')));

// HTTP sunucusunu express ile oluştur
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Oyun durumunu tutacak sınıflar
class Game {
    constructor() {
        this.teams = {
            red: new Team('red'),
            blue: new Team('blue')
        };
        this.ball = new Ball(400, 300); // Canvas ortası
        this.players = new Map();
        this.fieldWidth = 800;
        this.fieldHeight = 450;
        this.resetPositions();
    }

    resetPositions() {
        // Topu ortaya koy
        this.ball.x = this.fieldWidth / 2;
        this.ball.y = this.fieldHeight / 2;
        this.ball.dx = 0;
        this.ball.dy = 0;

        // Oyuncuları diziye al ve takımlara göre sırala
        const players = Array.from(this.players.values());
        const redTeam = players.filter(p => p.team.name === 'red');
        const blueTeam = players.filter(p => p.team.name === 'blue');

        // Güvenli mesafe (oyuncuların minimum arası mesafe)
        const minDistance = 50;
        
        // Her takım için oyuncuları yerleştir
        function placeTeamPlayers(teamPlayers, isRed) {
            const startX = isRed ? 0 : this.fieldWidth / 2;
            const endX = isRed ? this.fieldWidth / 2 : this.fieldWidth;
            
            for (let i = 0; i < teamPlayers.length; i++) {
                let validPosition = false;
                let attempts = 0;
                const player = teamPlayers[i];
                
                while (!validPosition && attempts < 100) {
                    // Yeni pozisyon dene
                    const newX = startX + Math.random() * (endX - startX - 2 * player.radius) + player.radius;
                    const newY = player.radius + Math.random() * (this.fieldHeight - 2 * player.radius);
                    
                    // Diğer oyuncularla çakışma kontrolü
                    validPosition = true;
                    for (let j = 0; j < i; j++) {
                        const otherPlayer = teamPlayers[j];
                        const dx = newX - otherPlayer.x;
                        const dy = newY - otherPlayer.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        if (distance < minDistance) {
                            validPosition = false;
                            break;
                        }
                    }
                    
                    // Kale bölgesi kontrolü
                    const goalY = (this.fieldHeight - this.fieldHeight/3) / 2;
                    const goalHeight = this.fieldHeight/3;
                    const goalWidth = this.fieldWidth/20;
                    
                    if (isRed && newX < goalWidth + player.radius) {
                        validPosition = false;
                    }
                    if (!isRed && newX > this.fieldWidth - goalWidth - player.radius) {
                        validPosition = false;
                    }
                    
                    // Eğer geçerli pozisyon bulunduysa oyuncuyu yerleştir
                    if (validPosition) {
                        player.x = newX;
                        player.y = newY;
                    }
                    
                    attempts++;
                }
                
                // Eğer 100 denemede uygun pozisyon bulunamadıysa, son denenen pozisyonu kullan
                if (!validPosition) {
                    player.x = startX + (endX - startX) / 2;
                    player.y = this.fieldHeight / 2;
                }
            }
        }
        
        // Her iki takımın oyuncularını yerleştir
        placeTeamPlayers.call(this, redTeam, true);
        placeTeamPlayers.call(this, blueTeam, false);
    }

    checkGoal() {
        const goalHeight = this.fieldHeight / 3;
        const goalY = (this.fieldHeight - goalHeight) / 2;
        const goalWidth = this.fieldWidth / 20;

        // Sol kale (Mavi takımın kalesi)
        if (this.ball.x <= goalWidth && 
            this.ball.y >= goalY && 
            this.ball.y <= goalY + goalHeight) {
            this.teams.red.score++;
            this.resetPositions();
            return 'red';
        }
        
        // Sağ kale (Kırmızı takımın kalesi)
        if (this.ball.x >= this.fieldWidth - goalWidth && 
            this.ball.y >= goalY && 
            this.ball.y <= goalY + goalHeight) {
            this.teams.blue.score++;
            this.resetPositions();
            return 'blue';
        }

        return null;
    }

    addPlayer(id, name) {
        const player = new Player(id, name);
        this.players.set(id, player);
        return player;
    }

    removePlayer(id) {
        this.players.delete(id);
    }

    update() {
        // Top fiziği
        this.ball.update();
        this.checkCollisions();
        this.checkGoal();
    }

    checkCollisions() {
        // Oyuncular arası çarpışma kontrolü
        const players = Array.from(this.players.values());
        
        for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
                const p1 = players[i];
                const p2 = players[j];
                
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const minDist = p1.radius + p2.radius;
                
                if (distance < minDist) {
                    // Çarpışma gerçekleşti
                    const angle = Math.atan2(dy, dx);
                    
                    // Oyuncuları birbirinden ayır
                    const overlap = minDist - distance;
                    const moveX = (overlap * Math.cos(angle)) / 2;
                    const moveY = (overlap * Math.sin(angle)) / 2;
                    
                    // Her iki oyuncuyu da ters yönlerde it
                    p1.x -= moveX;
                    p1.y -= moveY;
                    p2.x += moveX;
                    p2.y += moveY;
                    
                    // Momentum aktarımı
                    const p1Speed = Math.sqrt(p1.dx * p1.dx + p1.dy * p1.dy);
                    const p2Speed = Math.sqrt(p2.dx * p2.dx + p2.dy * p2.dy);
                    
                    // Her iki oyuncunun hızlarını birbirine aktar
                    const tempDx = p1.dx;
                    const tempDy = p1.dy;
                    
                    p1.dx = p2.dx * 0.8; // 0.8 çarpışma kaybı faktörü
                    p1.dy = p2.dy * 0.8;
                    p2.dx = tempDx * 0.8;
                    p2.dy = tempDy * 0.8;
                }
            }
        }

        // Top-oyuncu çarpışması kontrolü
        players.forEach(player => {
            const dx = this.ball.x - player.x;
            const dy = this.ball.y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDist = player.radius + this.ball.radius;
            
            if (distance < minDist) {
                const angle = Math.atan2(dy, dx);
                this.ball.x = player.x + Math.cos(angle) * minDist;
                this.ball.y = player.y + Math.sin(angle) * minDist;
                
                const power = Math.sqrt(player.dx * player.dx + player.dy * player.dy) + 5;
                this.ball.kick(power, angle);
            }
        });
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    }

    // Yeni oyuncuyu en az oyuncusu olan takıma ekle
    assignTeam(player) {
        const redCount = this.teams.red.players.size;
        const blueCount = this.teams.blue.players.size;

        if (redCount <= blueCount) {
            this.teams.red.addPlayer(player);
            return this.teams.red;
        } else {
            this.teams.blue.addPlayer(player);
            return this.teams.blue;
        }
    }
}

class Team {
    constructor(name) {
        this.name = name;
        this.score = 0;
        this.players = new Set();
    }

    addPlayer(player) {
        this.players.add(player);
        player.team = this;
    }

    removePlayer(player) {
        this.players.delete(player);
        player.team = null;
    }
}

class Player {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.x = 400;
        this.y = 300;
        this.team = null;
        this.speed = 5;
        this.radius = 15;
        this.dx = 0; // X ekseni hızı
        this.dy = 0; // Y ekseni hızı
    }

    move(dx, dy) {
        // Çapraz hareket için normalize et
        if (dx !== 0 && dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            dx /= length;
            dy /= length;
        }
        
        // Hızı güncelle
        this.dx = dx * this.speed;
        this.dy = dy * this.speed;
        
        let newX = this.x + this.dx;
        let newY = this.y + this.dy;
        
        // Saha sınırları kontrolü (kenarlardan çıkamama)
        newX = Math.max(this.radius, Math.min(800 - this.radius, newX));
        newY = Math.max(this.radius, Math.min(450 - this.radius, newY));
        
        // Köşe yayları kontrolü
        const cornerRadius = 45;
        const corners = [
            {x: 0, y: 0},
            {x: 800, y: 0},
            {x: 800, y: 450},
            {x: 0, y: 450}
        ];
        
        corners.forEach(corner => {
            const dx = newX - corner.x;
            const dy = newY - corner.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < cornerRadius + this.radius) {
                const angle = Math.atan2(dy, dx);
                newX = corner.x + (cornerRadius + this.radius) * Math.cos(angle);
                newY = corner.y + (cornerRadius + this.radius) * Math.sin(angle);
            }
        });
        
        this.x = newX;
        this.y = newY;
    }
}

class Ball {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.dx = 0;
        this.dy = 0;
        this.radius = 10;
        this.friction = 0.98; // Sürtünme katsayısı
        this.maxSpeed = 15;
    }

    update() {
        // Topun yeni pozisyonunu hesapla
        let newX = this.x + this.dx;
        let newY = this.y + this.dy;
        
        // Yatay sınır kontrolü
        if (newX - this.radius < 0) {
            newX = this.radius;
            this.dx = -this.dx * 0.8; // Çarpışma kaybı ile sekme
        } else if (newX + this.radius > 800) {
            newX = 800 - this.radius;
            this.dx = -this.dx * 0.8;
        }
        
        // Dikey sınır kontrolü
        if (newY - this.radius < 0) {
            newY = this.radius;
            this.dy = -this.dy * 0.8;
        } else if (newY + this.radius > 450) {
            newY = 450 - this.radius;
            this.dy = -this.dy * 0.8;
        }
        
        // Köşe yayları kontrolü
        const corners = [
            {x: 0, y: 0},
            {x: 800, y: 0},
            {x: 800, y: 450},
            {x: 0, y: 450}
        ];
        const cornerRadius = 45;
        
        corners.forEach(corner => {
            const dx = newX - corner.x;
            const dy = newY - corner.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < cornerRadius + this.radius) {
                // Köşeye çarpma açısını hesapla
                const angle = Math.atan2(dy, dx);
                // Topu köşe yayının dışına çıkar
                newX = corner.x + (cornerRadius + this.radius) * Math.cos(angle);
                newY = corner.y + (cornerRadius + this.radius) * Math.sin(angle);
                
                // Hız vektörünü yansıt
                const normalX = Math.cos(angle);
                const normalY = Math.sin(angle);
                const dot = this.dx * normalX + this.dy * normalY;
                this.dx = (this.dx - 2 * dot * normalX) * 0.8;
                this.dy = (this.dy - 2 * dot * normalY) * 0.8;
            }
        });
        
        // Pozisyonu güncelle
        this.x = newX;
        this.y = newY;
        
        // Sürtünme uygula
        this.dx *= this.friction;
        this.dy *= this.friction;
        
        // Çok küçük hızları sıfırla
        if (Math.abs(this.dx) < 0.01) this.dx = 0;
        if (Math.abs(this.dy) < 0.01) this.dy = 0;
    }

    kick(power, angle) {
        this.dx += Math.cos(angle) * power;
        this.dy += Math.sin(angle) * power;
        
        // Maksimum hızı sınırla
        const speed = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
        if (speed > this.maxSpeed) {
            const factor = this.maxSpeed / speed;
            this.dx *= factor;
            this.dy *= factor;
        }
    }
}

const game = new Game();

wss.on('connection', (ws) => {
    const playerId = Date.now().toString();
    
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        switch(data.type) {
            case 'join':
                const player = game.addPlayer(playerId, data.name);
                // Rastgele takım seçimi yerine dengeli dağıtım
                const team = game.assignTeam(player);
                break;
                
            case 'move':
                const currentPlayer = game.players.get(playerId);
                if (currentPlayer) {
                    currentPlayer.move(data.dx, data.dy);
                }
                break;
        }
        
        // Tüm oyunculara güncel durumu gönder
        broadcastGameState();
    });

    ws.on('close', () => {
        const player = game.players.get(playerId);
        if (player && player.team) {
            player.team.removePlayer(player);
        }
        game.removePlayer(playerId);
        broadcastGameState();
    });
});

function broadcastGameState() {
    const gameState = {
        teams: {
            red: {
                name: game.teams.red.name,
                score: game.teams.red.score,
                players: Array.from(game.teams.red.players)
            },
            blue: {
                name: game.teams.blue.name,
                score: game.teams.blue.score,
                players: Array.from(game.teams.blue.players)
            }
        },
        ball: game.ball,
        players: Array.from(game.players.values())
    };
    
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(gameState));
        }
    });
}

// Oyun döngüsü
setInterval(() => {
    game.update();
    broadcastGameState();
}, 1000 / 60); // 60 FPS

server.listen(3000, () => {
    console.log('Sunucu 3000 portunda çalışıyor');
}); 