import { Socket } from "socket.io"
import { Card, Deck, DeckType, deckFactory } from "./deck"
import logger from "../util/logger"
const GAMES: Map<string, Game> = new Map()

interface Score {
  teamA: number
  teamB: number
}

type GameSettings = {
  winAmount: number,
  enableWise: boolean,
}

type Player = {
  socket: Socket,
  hand: Card[],
  shouldPlay: boolean
  place: number
}

type PlayedCard = {
  card: Card,
  playerId: string,
}

class Game {
  roomKey: string
  settings: GameSettings
  running: boolean
  teamSwapLive: boolean
  players: Map<string, Player> = new Map()
  roundStartPlace: number
  deck: Deck
  currentStich: Array<PlayedCard>
  stichCounter = 0
  score: Score = { teamA: 0, teamB: 0 }
  constructor(key: string, host: Socket) {
    this.roomKey = key
    this.players.set(host.id, { socket: host, hand: [], shouldPlay: false, place: 0 })
    this.settings = { winAmount: 1000, enableWise: true }
    this.deck = this.createDeck(DeckType.UPDOWN) //Initial just for first play
    this.deck.buildDeck()
    this.currentStich = []
  }
  startGame(): void {
    this.running = true
  }
  getPlayerCards(): Array<Card[]> {
    return this.deck.distribute()
  }
  createDeck(type: DeckType): Deck {
    return deckFactory(type)
  }
  setRoundType(type: DeckType): void {
    this.deck = this.createDeck(type)
    this.deck.buildDeck()
    //Do not hand out new card, but update existing val and score
    this.players.forEach(p => {
      p.hand.forEach(c => {
        const card = this.deck.getCardById(c.id)
        c.value = card.value
        c.score = card.score
      })
    })
  }
  finishRound(): { nextPlayerId: string, roundFinished: boolean } {
    const nextRoundStartPlace = this.roundStartPlace + 1 > 3 ? 0 : this.roundStartPlace + 1
    return { nextPlayerId: this.getPlayers().find(p => p.place === nextRoundStartPlace).socket.id, roundFinished: true }
  }
  getCurrentStich(): PlayedCard[] {
    return this.currentStich
  }
  getStichCardsAndPlace(): { display: string, place: number }[] {
    return this.currentStich.map((c) => {
      return { display: c.card.display, place: this.players.get(c.playerId).place, value: c.card.value }
    })
  }
  getScore(): Score {
    return this.score
  }
  completeStich(): { nextPlayerId: string, roundFinished: boolean } {
    //FIXME: RENAME METHOD TO HIDE AT RETURN TYPE
    const winningCardId = this.deck.getStichWin(this.currentStich)
    let sum = 0
    let teamAWin = true
    let playerWinId = this.currentStich[0].playerId
    this.currentStich.forEach(c => {
      const playerPlace = this.players.get(c.playerId).place
      sum += c.card.score
      if (c.card.id === winningCardId) {
        if (playerPlace === 1 || playerPlace === 3) teamAWin = false
        playerWinId = c.playerId
      }
    })
    if (teamAWin) this.score.teamA += sum
    else this.score.teamB += sum
    this.currentStich = []
    this.stichCounter += 1
    if (this.stichCounter === 9) {
      return this.finishRound()
    } else {
      return {nextPlayerId: playerWinId, roundFinished: false}
    }
  }
  validPlay(player: Player, cid: number): boolean {
    if (!player.shouldPlay) {
      logger.log("error", `Invalid Play: Player ${player.place} should not play`)
      return false
    }
    if (!player.hand.find(c => c.id === cid)) {
      logger.log("error", `Invalid Play: Player ${player.place} has not card`)
      return false
    }
    if (!this.validCard(cid, player)) return false
    return true
  }
  validCard(id: number, player: Player): boolean {
    if (this.currentStich && this.currentStich.length > 0) {
      const activeSuit = this.deck.getCardById(
        this.currentStich[0].card.id
      ).suit
      const playerHasSuit = player.hand.find(c => c.suit === activeSuit) ? true : false
      const prevCard = this.deck.getCardById(
        this.currentStich[this.currentStich.length - 1].card.id
      )
      const nextCard = this.deck.getCardById(id)
      logger.log("info", `Card Validation: ASuit: ${activeSuit}, PHas: ${playerHasSuit}, prevC: ${prevCard.display}, nCard: ${nextCard.display}`)
      return this.deck.validateCard(activeSuit, playerHasSuit, prevCard, nextCard)
    } else {
      return true
    }

  }
  playCard(cid: number, pid: string): void {
    //Remove played card from player hand
    this.getPlayer(pid).hand = this.getPlayer(pid).hand.filter(c => c.id !== cid)
    //Add card to stich
    const card = this.deck.getCardById(cid)
    this.getCurrentStich().push({ card: card, playerId: pid })
  }
  setPlayerTurn(place: number): void {
    this.getPlayers().forEach(p => {
      p.place == place ? p.shouldPlay = true : p.shouldPlay = false
    })
  }
  getPlayers(): Player[] {
    return Array.from(this.players.values())
  }
  getPlayer(id: string): Player {
    return this.players.get(id)
  }
  getPlayersSocket(): Socket[] {
    return Array.from(this.players.values()).map((p) => p.socket)
  }
  getPlayersSocketAndPlace(): { socket: Socket, place: number }[] {
    return Array.from(this.players.values()).map((p) => {
      return { socket: p.socket, place: p.place }
    })
  }
  addPlayer(player: Socket, place: number): void {
    this.players.set(player.id, { hand: [], socket: player, shouldPlay: false, place: place })
  }
  removePlayer(id: string): void {
    this.players.delete(id)
  }
  getSettings(): GameSettings {
    return this.settings
  }
  setSettings(settings: GameSettings): void {
    this.settings = settings
  }
  serialize(): string {
    return "string"
  }
}

export { GAMES, Game, PlayedCard }