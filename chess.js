'use strict';

//--------------------------------------------------- constants -------------------------------------------------

var kTileSize = 64;
var kBoardSize = 8*kTileSize;
var kTakenSize = 32;
var kGameHeight = kBoardSize + 2*kTakenSize;
var kRGBLightSquare = "#FFF7E0";
var kRGBDarkSquare = "#E09070";
var kRGBSelectedLightSquare = "#A0B0FF";
var kRGBSelectedDarkSquare = "#7090E0";
var kRGBMove = "#402020";
var kRGBComputerMove = "#FFFFFF";

var kDefaultPieceValue = {
    'p': 1,
    'h': 10,
    'b': 12,
    'r': 20,
    'q': 30,
    'k': 1000
};
var kDefaultDepthFactor = { // value of piece in square (i, j) is incremented by depthFactor[piece]*(j-3.5)
    'p': -0.2,
    'h': -0.1,
    'b': -0.1,
    'r': 0,
    'q': 0,
    'k': 0.1
};
var kDefaultCenterFactor = { // value of piece in square (i, j) is also incremented by centerFactor ^ (3.5-abs(i-3.5))
    'p': 1.2,
    'h': 1.1,
    'b': 1.05,
    'r': 1.02,
    'q': 1.01,
    'k': 0.99
};
var kDefaultDangerFactor = 0.8; // if a piece is attacked more than supported, -dangerFactor*pieceValue is added

//--------------------------------------------------- globals ---------------------------------------------------

var gCanvasElement;
var gCtx;
var gStatusElement;
var gButtonsElement;
var gRestartWhiteElement;
var gRestartBlackElement;
var gPieceImages;

var gState;
var gScoring;

//---------------------------------------------- game initialization ---------------------------------------------

function initChess() {
    // set up the status text
    if (!gStatusElement) {
        gStatusElement = document.createElement("p");
        gStatusElement.innerHTML = "Ready.";
        document.body.appendChild(gStatusElement);
    }

    // set up the canvas we draw the board and taken pieces on
    if (!gCanvasElement) {
        gCanvasElement = document.createElement("canvas");
        document.body.appendChild(gCanvasElement);
    }
    gCanvasElement.width = kBoardSize;
    gCanvasElement.height = kGameHeight;
    gCtx = gCanvasElement.getContext("2d");

    // set up restart buttons
    if (!gButtonsElement) {
        gButtonsElement = document.createElement("div");
        document.body.appendChild(gButtonsElement);
    }
    if (!gRestartWhiteElement) {
        gRestartWhiteElement = document.createElement("button");
        gRestartWhiteElement.type = "button";
        gRestartWhiteElement.innerHTML = "Restart as white";
        gRestartWhiteElement.onclick = restartAsWhite;
        gButtonsElement.appendChild(gRestartWhiteElement);
    }
    if (!gRestartBlackElement) {
        gRestartBlackElement = document.createElement("button");
        gRestartBlackElement.innerHTML = "Restart as black";
        gRestartBlackElement.onclick = restartAsBlack;
        gButtonsElement.appendChild(gRestartBlackElement);
    }

    gPieceImages = {};
    gPieceImages.wp = document.getElementById("wp");
    gPieceImages.wh = document.getElementById("wh");
    gPieceImages.wb = document.getElementById("wb");
    gPieceImages.wr = document.getElementById("wr");
    gPieceImages.wq = document.getElementById("wq");
    gPieceImages.wk = document.getElementById("wk");
    gPieceImages.bp = document.getElementById("bp");
    gPieceImages.bh = document.getElementById("bh");
    gPieceImages.bb = document.getElementById("bb");
    gPieceImages.br = document.getElementById("br");
    gPieceImages.bq = document.getElementById("bq");
    gPieceImages.bk = document.getElementById("bk");

    gScoring = new Scoring (0.05);
    gState = new GameState();
    draw();

    gCanvasElement.addEventListener("click", handleBoardClick, false);
}

//--------------------------------------------- basic chess objects ---------------------------------------------

function Square(i, j) {
    this.i = i;
    this.j = j;
}

function Board(otherBoard) {
    var i, j;
    if (otherBoard) {
        for (i = 0; i < 8; ++i) {
            this[i] = [];
            for (j = 0; j < 8; ++j) {
                this[i][j] = otherBoard[i][j];
            }
        }
        this.lowBlackCastleOption = otherBoard.lowBlackCastleOption;
        this.highBlackCastleOption = otherBoard.highBlackCastleOption;
        this.lowWhiteCastleOption = otherBoard.lowWhiteCastleOption;
        this.highWhiteCastleOption = otherBoard.highWhiteCastleOption;
    } else {
        // start fresh: looks weird because [x][y] notation is transposed
        this[0] = ['br', 'bp', '', '', '', '', 'wp', 'wr'];
        this[1] = ['bh', 'bp', '', '', '', '', 'wp', 'wh']; 
        this[2] = ['bb', 'bp', '', '', '', '', 'wp', 'wb'];
        this[3] = ['bq', 'bp', '', '', '', '', 'wp', 'wq'];
        this[4] = ['bk', 'bp', '', '', '', '', 'wp', 'wk'];
        this[5] = ['bb', 'bp', '', '', '', '', 'wp', 'wb'];
        this[6] = ['bh', 'bp', '', '', '', '', 'wp', 'wh']; 
        this[7] = ['br', 'bp', '', '', '', '', 'wp', 'wr'];
        this.lowBlackCastleOption = true;
        this.highBlackCastleOption = true;
        this.lowWhiteCastleOption = true;
        this.highWhiteCastleOption = true;
    }
}

function GameState() {
    this.board = new Board();
    this.result = null; // defined once game is over
    this.userColor = 'w';
    this.selected = null;
    this.moves = [];
    this.takenBlack = [];
    this.takenWhite = [];
    this.computerFrom = null; // keep a record of computer's last move for display
    this.computerTo = null;
}

//------------------------------------------------- heuristic scoring -----------------------------------------------------

function randomRange(lo, hi) {
    return lo + (hi - lo) * Math.random();
}

// Randomize the scoring by a small factor r, so as to give different playing results each time.
function Scoring (r) {
    this.pieceValue = {
        'wp': kDefaultPieceValue.p * randomRange(1-r, 1+r),
        'wh': kDefaultPieceValue.h * randomRange(1-r, 1+r),
        'wb': kDefaultPieceValue.b * randomRange(1-r, 1+r),
        'wr': kDefaultPieceValue.r * randomRange(1-r, 1+r),
        'wq': kDefaultPieceValue.q * randomRange(1-r, 1+r),
        'wk': kDefaultPieceValue.k * randomRange(1-r, 1+r) 
    };
    this.pieceValue.bp = -this.pieceValue.wp;
    this.pieceValue.bh = -this.pieceValue.wh;
    this.pieceValue.bb = -this.pieceValue.wb;
    this.pieceValue.br = -this.pieceValue.wr;
    this.pieceValue.bq = -this.pieceValue.wq;
    this.pieceValue.bk = -this.pieceValue.wk;

    this.depthFactor = {
        'wp': kDefaultDepthFactor.p + randomRange(-r, r),
        'wh': kDefaultDepthFactor.h + randomRange(-r, r),
        'wb': kDefaultDepthFactor.b + randomRange(-r, r),
        'wr': kDefaultDepthFactor.r + randomRange(-r, r),
        'wq': kDefaultDepthFactor.q + randomRange(-r, r),
        'wk': kDefaultDepthFactor.k + randomRange(-r, r)
    };
    this.depthFactor.bp = this.depthFactor.wp;
    this.depthFactor.bh = this.depthFactor.wh;
    this.depthFactor.bb = this.depthFactor.wb;
    this.depthFactor.br = this.depthFactor.wr;
    this.depthFactor.bq = this.depthFactor.wq;
    this.depthFactor.bk = this.depthFactor.wk;

    this.centerFactor = {
        'wp': 1 + (kDefaultCenterFactor.p-1) * randomRange(1-r, 1+r),
        'wh': 1 + (kDefaultCenterFactor.h-1) * randomRange(1-r, 1+r),
        'wb': 1 + (kDefaultCenterFactor.b-1) * randomRange(1-r, 1+r),
        'wr': 1 + (kDefaultCenterFactor.r-1) * randomRange(1-r, 1+r),
        'wq': 1 + (kDefaultCenterFactor.q-1) * randomRange(1-r, 1+r),
        'wk': 1 + (kDefaultCenterFactor.k-1) * randomRange(1-r, 1+r)
    };
    this.centerFactor.bp = this.centerFactor.wp;
    this.centerFactor.bh = this.centerFactor.wh;
    this.centerFactor.bb = this.centerFactor.wb;
    this.centerFactor.br = this.centerFactor.wr;
    this.centerFactor.bq = this.centerFactor.wq;
    this.centerFactor.bk = this.centerFactor.wk;

    this.dangerFactor = kDefaultDangerFactor * randomRange(1-r, 1+r); 
};

// Return a score for the piece at i,j, where + means better for white, - means better for black.
// This takes into account the piece's color and type (pawn etc.), its location, and whether it's being attacked or supported.
// It does not consider specifically how it could attack other pieces.
function scorePiece (board, i, j) {
    var k;
    var p;
    var score = 0;
    var attackers;
    var attacks = 0, supports = 0;
    p = board[i][j];
    if (p !== '') {
        // score first for simple presence and location
        score = gScoring.pieceValue[p] + (j-3.5)*gScoring.depthFactor[p]
                                          * Math.pow(gScoring.centerFactor[p], 3.5-Math.abs(i-.35));
        // then modify score based on how much support / danger this piece is in
        attackers = canAttack(board, new Square(i, j));
        for( k = 0; k < attackers.length; ++k) {
            if (attackers[k][0] === p[0]){ // same color: support?
                ++supports;
            } else { // different color: attack
                ++attacks;
            }
        }
        if (attacks > supports) {
            score -= gScoring.dangerFactor * gScoring.pieceValue[p];
        }
    }
    return score;
}

// return a number, + means better for white, - means better for black, based on pieces in play
function scoreBoard (board) {
    var i, j;
    var score = 0;
    for (i = 0; i < 8; ++i) {
        for (j = 0; j < 8; ++j) {
            score += scorePiece (board, i, j);
        }
    }
    // random fuzz
    score += randomRange(0, 0.25);
    return score;
}

// Return an array of the pieces on the board which could attack the given square (if a piece of the opposite colour were there)
// ignoring issues of check.
function canAttack (board, square) {
    var attackers = [];
    var p, i, j, first;
    // black pawn, ignoring en passant for now
    if (square.j > 0) {
        if (square.i > 0 && board[square.i-1][square.j-1] === 'bp') attackers.push('bp');
        if (square.i < 7 && board[square.i+1][square.j-1] === 'bp') attackers.push('bp');
    }
    // white pawn, ignoring en passant for now
    if (square.j < 7) {
        if (square.i > 0 && board[square.i-1][square.j+1] === 'wp') attackers.push('wp');
        if (square.i < 7 && board[square.i+1][square.j+1] === 'wp') attackers.push('wp');
    }
    // knights
    if (square.i > 1 && square.j > 0 && board[square.i-2][square.j-1][1] === 'h') attackers.push(board[square.i-2][square.j-1]);
    if (square.i > 1 && square.j < 7 && board[square.i-2][square.j+1][1] === 'h') attackers.push(board[square.i-2][square.j+1]);
    if (square.i < 6 && square.j > 0 && board[square.i+2][square.j-1][1] === 'h') attackers.push(board[square.i+2][square.j-1]);
    if (square.i < 6 && square.j < 7 && board[square.i+2][square.j+1][1] === 'h') attackers.push(board[square.i+2][square.j+1]);
    if (square.i > 0 && square.j > 1 && board[square.i-1][square.j-2][1] === 'h') attackers.push(board[square.i-1][square.j-2]);
    if (square.i > 0 && square.j < 6 && board[square.i-1][square.j+2][1] === 'h') attackers.push(board[square.i-1][square.j+2]);
    if (square.i < 7 && square.j > 1 && board[square.i+1][square.j-2][1] === 'h') attackers.push(board[square.i+1][square.j-2]);
    if (square.i < 7 && square.j < 6 && board[square.i+1][square.j+2][1] === 'h') attackers.push(board[square.i+1][square.j+2]);
    // pieces along diagonals
    for (i = square.i-1, j = square.j-1, first = true; i >= 0 && j >= 0; --i, --j, first = false) {
        p = board[i][j];
        if (p !== '') {
            if (p[1] === 'b' || p[1] === 'q' || (first && p[1] === 'k')) attackers.push(p);
            break;
        }
    }
    for (i = square.i+1, j = square.j-1, first = true; i <= 7 && j >= 0; ++i, --j, first = false) {
        p = board[i][j];
        if (p !== '') {
            if (p[1] === 'b' || p[1] === 'q' || (first && p[1] === 'k')) attackers.push(p);
            break;
        }
    }
    for (i = square.i-1, j = square.j+1, first = true; i >= 0 && j <= 7; --i, ++j, first = false) {
        p = board[i][j];
        if (p !== '') {
            if (p[1] === 'b' || p[1] === 'q' || (first && p[1] === 'k')) attackers.push(p);
            break;
        }
    }
    for (i = square.i+1, j = square.j+1, first = true; i <= 7 && j <= 7; ++i, ++j, first = false) {
        p = board[i][j];
        if (p !== '') {
            if (p[1] === 'b' || p[1] === 'q' || (first && p[1] === 'k')) attackers.push(p);
            break;
        }
    }
    // pieces along straight
    for (i = square.i-1, j = square.j, first = true; i >= 0; --i, first = false) {
        p = board[i][j];
        if (p !== '') {
            if (p[1] === 'r' || p[1] === 'q' || (first && p[1] === 'k')) attackers.push(p);
            break;
        }
    }
    for (i = square.i+1, j = square.j, first = true; i <= 7; ++i, first = false) {
        p = board[i][j];
        if (p !== '') {
            if (p[1] === 'r' || p[1] === 'q' || (first && p[1] === 'k')) attackers.push(p);
            break;
        }
    }
    for (i = square.i, j = square.j-1, first = true; j >= 0; --j, first = false) {
        p = board[i][j];
        if (p !== '') {
            if (p[1] === 'r' || p[1] === 'q' || (first && p[1] === 'k')) attackers.push(p);
            break;
        }
    }
    for (i = square.i, j = square.j+1, first = true; j <= 7; ++j, first = false) {
        p = board[i][j];
        if (p !== '') {
            if (p[1] === 'r' || p[1] === 'q' || (first && p[1] === 'k')) attackers.push(p);
            break;
        }
    }
    return attackers;
}

//------------------------------------------------------- move basics ---------------------------------------------------

// make a list of moves not taking 'check' into account, not including castling (which involves check)
function findPossibleRegularMoves (board, square) {
    var i, j;
    var moves = [];
    var p = board[square.i][square.j];
    if (p === '') {
        ;
    } else if (p === 'bp') {
        if(square.j < 7) {
            if(board[square.i][square.j+1] === '') moves.push(new Square(square.i, square.j+1));
            if(square.j === 1 && board[square.i][2] === '' && board[square.i][3]=='') moves.push(new Square(square.i, 3));
            if(square.i > 0 && board[square.i-1][square.j+1][0] === 'w') moves.push(new Square(square.i-1, square.j+1));
            if(square.i < 7 && board[square.i+1][square.j+1][0] === 'w') moves.push(new Square(square.i+1, square.j+1));
        }
    } else if (p === 'wp') {
        if(square.j > 0) {
            if(board[square.i][square.j-1] === '') moves.push(new Square(square.i, square.j-1));
            if(square.j === 6 && board[square.i][5] === '' && board[square.i][4]=='') moves.push(new Square(square.i, 4));
            if(square.i > 0 && board[square.i-1][square.j-1][0] === 'b') moves.push(new Square(square.i-1, square.j-1));
            if(square.i < 7 && board[square.i+1][square.j-1][0] === 'b') moves.push(new Square(square.i+1, square.j-1));
        }
    } else if (p[1] === 'h') {
        if(square.i > 1 && square.j > 0 && !(board[square.i-2][square.j-1][0]===p[0])) moves.push(new Square(square.i-2, square.j-1));
        if(square.i > 1 && square.j < 7 && !(board[square.i-2][square.j+1][0]===p[0])) moves.push(new Square(square.i-2, square.j+1));
        if(square.i < 6 && square.j > 0 && !(board[square.i+2][square.j-1][0]===p[0])) moves.push(new Square(square.i+2, square.j-1));
        if(square.i < 6 && square.j < 7 && !(board[square.i+2][square.j+1][0]===p[0])) moves.push(new Square(square.i+2, square.j+1));
        if(square.i > 0 && square.j > 1 && !(board[square.i-1][square.j-2][0]===p[0])) moves.push(new Square(square.i-1, square.j-2));
        if(square.i > 0 && square.j < 6 && !(board[square.i-1][square.j+2][0]===p[0])) moves.push(new Square(square.i-1, square.j+2));
        if(square.i < 7 && square.j > 1 && !(board[square.i+1][square.j-2][0]===p[0])) moves.push(new Square(square.i+1, square.j-2));
        if(square.i < 7 && square.j < 6 && !(board[square.i+1][square.j+2][0]===p[0])) moves.push(new Square(square.i+1, square.j+2));
    } else if (p[1] === 'k') { // kings
        if(square.i > 0 && square.j > 0 && board[square.i-1][square.j-1][0] !== p[0]) moves.push(new Square(square.i-1, square.j-1));
        if(square.i > 0 && board[square.i-1][square.j][0] !== p[0]) moves.push(new Square(square.i-1, square.j));
        if(square.i > 0 && square.j < 7 && board[square.i-1][square.j+1][0] !== p[0]) moves.push(new Square(square.i-1, square.j+1));
        if(square.j > 0 && board[square.i][square.j-1][0] !== p[0]) moves.push(new Square(square.i, square.j-1));
        if(square.j < 7 && board[square.i][square.j+1][0] !== p[0]) moves.push(new Square(square.i, square.j+1));
        if(square.i < 7 && square.j > 0 && board[square.i+1][square.j-1][0] !== p[0]) moves.push(new Square(square.i+1, square.j-1));
        if(square.i < 7 && board[square.i+1][square.j][0] !== p[0]) moves.push(new Square(square.i+1, square.j));
        if(square.i < 7 && square.j < 7 && board[square.i+1][square.j+1][0] !== p[0]) moves.push(new Square(square.i+1, square.j+1));
    } else {
        if (p[1] === 'b' || p[1] === 'q') { // diagonal moves ?
            for(i = square.i-1, j = square.j-1; i >= 0 && j >= 0; --i, --j) {
                if(board[i][j][0] === p[0]) break;
                else{
                    moves.push(new Square(i, j));
                    if(board[i][j]) break;
                }
            }
            for(i = square.i+1, j = square.j-1; i <= 7 && j >= 0; ++i, --j) {
                if(board[i][j][0] === p[0]) break;
                else{
                    moves.push(new Square(i, j));
                    if(board[i][j]) break;
                }
            }
            for(i = square.i-1, j = square.j+1; i >= 0 && j <= 7; --i, ++j) {
                if(board[i][j][0] === p[0]) break;
                else{
                    moves.push(new Square(i, j));
                    if(board[i][j]) break;
                }
            }
            for(i = square.i+1, j = square.j+1; i <= 7 && j <= 7; ++i, ++j) {
                if(board[i][j][0] === p[0]) break;
                else{
                    moves.push(new Square(i, j));
                    if(board[i][j]) break;
                }
            }
        }
        if (p[1] === 'r' || p[1] === 'q') { // straight moves ?
            for(i = square.i-1, j = square.j; i >= 0; --i) {
                if(board[i][j][0] === p[0]) break;
                else{
                    moves.push(new Square(i, j));
                    if(board[i][j]) break;
                }
            }
            for(i = square.i+1, j = square.j; i <= 7; ++i) {
                if(board[i][j][0] === p[0]) break;
                else{
                    moves.push(new Square(i, j));
                    if(board[i][j]) break;
                }
            }
            for(j = square.j-1, i = square.i; j >= 0; --j) {
                if(board[i][j][0] === p[0]) break;
                else{
                    moves.push(new Square(i, j));
                    if(board[i][j]) break;
                }
            }
            for(j = square.j+1, i = square.i; j <= 7; ++j) {
                if(board[i][j][0] === p[0]) break;
                else{
                    moves.push(new Square(i, j));
                    if(board[i][j]) break;
                }
            }
        }
    }
    return moves;
}

// Only returns moves possible from square in the given board which avoid check
// (if the answer is empty, this piece cannot be moved).
function findValidMoves (board, square) {
    var i;
    var valid = [];
    var color = board[square.i][square.j][0];
    var attackers;
    var goForIt;
    // begin with regular moves, filtered by what doesn't leave king in check
    var possible = findPossibleRegularMoves (board, square);
    for (i = 0; i < possible.length; ++i) {
        if (!inCheck (makeMove (board, square, possible[i]), color)) {
            valid.push(possible[i]);
        }
    }
    // in addition, include castling special cases
    if (board[square.i][square.j][1] === 'k') {
        if (color === 'w') {
            if (board.lowWhiteCastleOption) {
                // are there any pieces in between king and rook?
                if (board[1][7] === '' && board[2][7] === '' && board[3][7] === '') {
                    // is the current king's position and any position in between under attack?
                    attackers = canAttack (board, new Square(2, 7))
                                + canAttack (board, new Square(3, 7))
                                + canAttack (board, new Square(4, 7));
                    goForIt = true;
                    for (i = 0; i < attackers.length; ++i) {
                        if (attackers[i][0] === 'b') {
                            goForIt = false;
                            break;
                        }
                    }
                    if (goForIt) valid.push(new Square(2, 7));
                }
            }
            if (board.highWhiteCastleOption) {
                // are there any pieces in between king and rook?
                if (board[5][7] === '' && board[6][7] === '') {
                    // is the current king's position and any position in between under attack?
                    attackers = canAttack (board, new Square(4, 7))
                                + canAttack (board, new Square(5, 7))
                                + canAttack (board, new Square(6, 7));
                    goForIt = true;
                    for (i = 0; i < attackers.length; ++i) {
                        if (attackers[i][0] === 'b') {
                            goForIt = false;
                            break;
                        }
                    }
                    if (goForIt) valid.push(new Square(6, 7));
                }
            }
        } else {
            if (board.lowBlackCastleOption) {
                // are there any pieces in between king and rook?
                if (board[1][0] === '' && board[2][0] === '' && board[3][0] === '') {
                    // is the current king's position and any position in between under attack?
                    attackers = canAttack (board, new Square(2, 0))
                                + canAttack (board, new Square(3, 0))
                                + canAttack (board, new Square(4, 0));
                    goForIt = true;
                    for (i = 0; i < attackers.length; ++i) {
                        if (attackers[i][0] === 'w') {
                            goForIt = false;
                            break;
                        }
                    }
                    if (goForIt) valid.push(new Square(2, 0));
                }
            }
            if (board.highBlackCastleOption) {
                // are there any pieces in between king and rook?
                if (board[5][0] === '' && board[6][0] === '') {
                    // is the current king's position and any position in between under attack?
                    attackers = canAttack (board, new Square(4, 0))
                                + canAttack (board, new Square(5, 0))
                                + canAttack (board, new Square(6, 0));
                    goForIt = true;
                    for (i = 0; i < attackers.length; ++i) {
                        if (attackers[i][0] === 'w') {
                            goForIt = false;
                            break;
                        }
                    }
                    if (goForIt) valid.push(new Square(6, 0));
                }
            }
        }
    }
    return valid;
}

// test if the king of given color ('b' or 'w') is in check on the given board
function inCheck (board, color) {
    var i, j, ki = -1, kj, t;
    var attackers;
    // first find the king
    for (i = 0; i < 8; ++i){
        for (j = 0; j < 8; ++j) {
            if (board[i][j][0] === color && board[i][j][1] === 'k') {
                ki = i;
                kj = j;
                break;
            }
        }
        if (ki >= 0) break;
    }
    if (ki === -1) return true; // king isn't even on the board!
    // get a list of potential attackers
    attackers = canAttack (board, new Square(ki, kj));
    // detect if any pieces of the opposite color can attack
    for (t = 0; t < attackers.length; ++t) {
        if (attackers[t][0] !== color) return true;
    }
    // otherwise king is safe
    return false;
}

// Returns a new board having made the move (note this doesn't touch game state).
// The new board has the .taken field set to '' or the piece that may have been taken in the move.
function makeMove (oldBoard, fromSquare, toSquare)
{
    var newBoard = new Board(oldBoard);
    var p = newBoard[fromSquare.i][fromSquare.j];
    // check for castling
    if (p[1] === 'k' && fromSquare.i === 4) {
        if (toSquare.i === 2) {
            // move the rook too
            newBoard[3][fromSquare.j] = newBoard[0][fromSquare.j];
            newBoard[0][fromSquare.j] = '';
        } else if (toSquare.i === 6) {
            // move the rook too
            newBoard[5][fromSquare.j] = newBoard[7][fromSquare.j];
            newBoard[7][fromSquare.j] = '';
        }
    }
    // disallow future castling if moving king or touching in some way the relevant rook
    if (p[1] === 'k') {
        if(p[0] === 'w') {
            newBoard.lowWhiteCastleOption = false;
            newBoard.highWhiteCastleOption = false;
        } else {
            newBoard.lowBlackCastleOption = false;
            newBoard.highBlackCastleOption = false;
        }
    }
    if (fromSquare.i === 0 && fromSquare.j === 7) newBoard.lowWhiteCastleOption = false;
    if (fromSquare.i === 7 && fromSquare.j === 7) newBoard.highWhiteCastleOption = false;
    if (fromSquare.i === 0 && fromSquare.j === 0) newBoard.lowBlackCastleOption = false;
    if (fromSquare.i === 7 && fromSquare.j === 0) newBoard.highBlackCastleOption = false;
    if (toSquare.i === 0 && toSquare.j === 7) newBoard.lowWhiteCastleOption = false;
    if (toSquare.i === 7 && toSquare.j === 7) newBoard.highWhiteCastleOption = false;
    if (toSquare.i === 0 && toSquare.j === 0) newBoard.lowBlackCastleOption = false;
    if (toSquare.i === 7 && toSquare.j === 0) newBoard.highBlackCastleOption = false;
    // check for pawn promotion
    if (p === 'bp' && toSquare.j === 7) {
        p = 'bq';
    } else if (p === 'wp' && toSquare.j === 0) {
        p = 'wq';
    }
    // finally the regular move
    newBoard.taken = newBoard[toSquare.i][toSquare.j]; // save for caller
    newBoard[toSquare.i][toSquare.j] = p;
    newBoard[fromSquare.i][fromSquare.j] = '';
    return newBoard;
}

function userMove (newSquare) {
    gState.board = makeMove(gState.board, gState.selected, newSquare);
    if (gState.board.taken){
        if (gState.board.taken[0] === 'w'){
            gState.takenWhite.push(gState.board.taken);
        } else {
            gState.takenBlack.push(gState.board.taken);
        }
    }
    gState.selected = null;
    gState.moves = [];
}

function canMove (board, color) {
    var i, j;
    var moves;
    for (i = 0; i < 8; ++i) for (j = 0; j < 8; ++j) {
        if (board[i][j][0] === color) {
            moves = findValidMoves(board, new Square(i, j));
            if (moves.length > 0) {
                return true;
            }
        }
    }
    return false;
}

function computerMove () {
    var i, j, k;
    var computerColor = (gState.userColor === 'w' ? 'b' : 'w');
    var s, bestScore = null;
    var from, bestFrom, bestTo;
    var moves;
    var target;
    // let user know we're working
    gStatusElement.innerHTML = "Thinking...";
    // find the valid move that produces the best score for the computer
    for (i = 0; i < 8; ++i) for (j = 0; j < 8; ++j) {
        if (gState.board[i][j][0] === computerColor) {
            from = new Square(i, j);
            moves = findValidMoves(gState.board, from);
            for (k = 0; k < moves.length; ++k) {
                s = scoreBoard(makeMove(gState.board, from, moves[k]));
                if (bestScore === null || (computerColor === 'w' && s > bestScore) || (computerColor === 'b' && s < bestScore)) {
                    bestScore = s;
                    bestFrom = from;
                    bestTo = moves[k];
                }
            }
        }
    }
    // make the move
    if (bestScore) {
        gState.board = makeMove(gState.board, bestFrom, bestTo);
        if (gState.board.taken){
            if (gState.board.taken[0] === 'w'){
                gState.takenWhite.push(gState.board.taken);
            } else {
                gState.takenBlack.push(gState.board.taken);
            }
        }
        gState.computerFrom = bestFrom;
        gState.computerTo = bestTo;
        // check on state
        if (!canMove(gState.board, gState.userColor)) {
            if (inCheck(gState.board, gState.userColor)) {
            gState.result = "computer wins";
            gStatusElement.innerHTML = "Checkmate: you lost. :-(";
            } else {
                gState.result = "stalemate";
                gStatusElement.innerHTML = "Stalemate.";
            }
        } else if (inCheck(gState.board, gState.userColor)) {
            gStatusElement.innerHTML = "Check.";
        } else {
            gStatusElement.innerHTML = "Ready.";
        }
    } else { // no computer move is valid: game over
        if (inCheck(gState.board, computerColor)) {
            gState.result = "user wins";
            gStatusElement.innerHTML = "Checkmate: you win!";
        } else {
            gState.result = "stalemate";
            gStatusElement.innerHTML = "Stalemate.";
        }
    }
}

//------------------------------------------------ move searches ------------------------------------------------------




//-------------------------------------------------- display ----------------------------------------------------------

function draw () {
    var i;
    var j;
    var m;
    var img;
    // background
    gCtx.fillStyle = kRGBLightSquare;
    gCtx.fillRect(0, kTakenSize, kBoardSize, kBoardSize);
    gCtx.fillStyle = kRGBDarkSquare;
    for (i = 0; i < 8; ++i) {
        for (j = (i+1)%2; j < 8; j += 2) {
            gCtx.fillRect(i*kTileSize, j*kTileSize+kTakenSize, kTileSize, kTileSize);
        }
    }
    // highlight computer's last move if available
    if (gState.computerFrom) {
        gCtx.strokeStyle = kRGBComputerMove;
        gCtx.lineWidth = 3;
        gCtx.beginPath();
        gCtx.moveTo((gState.computerFrom.i + 0.5)*kTileSize, (gState.computerFrom.j + 0.5)*kTileSize + kTakenSize);
        gCtx.lineTo((gState.computerTo.i + 0.5)*kTileSize, (gState.computerTo.j + 0.5)*kTileSize + kTakenSize);
        gCtx.stroke();
    }
    // playing state
    if (gState.selected) {
        i = gState.selected.i;
        j = gState.selected.j;
        gCtx.fillStyle = (i+j)%2 ? kRGBSelectedDarkSquare : kRGBSelectedLightSquare;
        gCtx.fillRect(i*kTileSize+2, j*kTileSize+kTakenSize+2, kTileSize-4, kTileSize-4);
    }
    gCtx.strokeStyle = kRGBMove;
    gCtx.lineWidth = 3;
    for (m = 0; m < gState.moves.length; ++m) {
        i = gState.moves[m].i;
        j = gState.moves[m].j;
        gCtx.strokeRect(i*kTileSize+2, j*kTileSize+kTakenSize+2, kTileSize-4, kTileSize-4);
    }
    // pieces in play
    for (i = 0; i < 8; ++i) {
        for (j = 0; j < 8; ++j) {
            if (gState.board[i][j]) {
                img = gPieceImages[gState.board[i][j]];
                gCtx.drawImage(img, i*kTileSize, j*kTileSize+kTakenSize, kTileSize, kTileSize);
            }
        }
    }
    // taken pieces
    gCtx.fillStyle = "#FFFFFF";
    gCtx.fillRect(0, 0, kBoardSize, kTakenSize);
    gCtx.fillRect(0, kBoardSize + kTakenSize, kBoardSize, kTakenSize);
    for (i = 0; i < gState.takenWhite.length; ++i) {
        img = gPieceImages[gState.takenWhite[i]];
        gCtx.drawImage(img, i*kTakenSize, 0, kTakenSize, kTakenSize);
    }
    for (i = 0; i < gState.takenBlack.length; ++i) {
        img = gPieceImages[gState.takenBlack[i]];
        gCtx.drawImage(img, i*kTakenSize, kTakenSize+kBoardSize, kTakenSize, kTakenSize);
    }
}

//---------------------------------------------- user interaction ---------------------------------------------------------

function findSquareFromClick (e) {
    var x, y;
    var i, j;
    if (e.pageX !== undefined && e.pageY != undefined) {
        x = e.pageX
        y = e.pageY;
    } else {
        x = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
        y = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
    }
    i = Math.floor((x - gCanvasElement.offsetLeft) / kTileSize);
    j = Math.floor((y - gCanvasElement.offsetTop - kTakenSize) / kTileSize);
    i = Math.max(0, Math.min(7, i));
    j = Math.max(0, Math.min(7, j));
    return new Square(i, j);
}

function handleBoardClick (e) {
    var sq=findSquareFromClick(e);
    var k;
    var moves;
    if (gState.result) { // game over?
        ; // do nothing
    } else if (gState.selected) {
        // check if square is from the list of possible moves
        for (k = 0; k < gState.moves.length; ++k) {
            if (sq.i === gState.moves[k].i && sq.j === gState.moves[k].j) {
                userMove(sq);
                draw();
                break;
            }
        }
        // check if still selected (click was not a valid move)
        if (gState.selected) {
            // unselect
            gState.selected = null;
            gState.moves = [];
        } else { // otherwise it was a fine move, computer goes now
            computerMove();
        }
        draw();
    } else if (gState.board[sq.i][sq.j][0]==gState.userColor) {
        moves = findValidMoves(gState.board, sq);
        if (moves.length > 0) {
            gState.selected = sq;
            gState.moves = moves;
            draw();
        }
    }
}

function restartAsWhite () {
    gScoring = new Scoring (0.05);
    gState = new GameState();
    draw();
}

function restartAsBlack () {
    gScoring = new Scoring (0.05);
    gState = new GameState();
    gState.userColor = 'b';
    computerMove();
    draw();
}

