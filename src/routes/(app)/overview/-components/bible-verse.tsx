import { clientTz, getWeek, now } from '#/core/date'
import { cx } from '#/styles/cx'

interface Verse {
  ref: string
  text: string
}

const verses: [Verse, ...Verse[]] = [
  {
    ref: 'Proverbs 11:25',
    text: 'The generous will prosper; those who refresh others will themselves be refreshed.',
  },
  {
    ref: '1 John 3:16',
    text: 'This is how we know what love is: Jesus Christ laid down his life for us. And we ought to lay down our lives for our brothers and sisters.',
  },
  {
    ref: '1 John 3:18',
    text: 'Dear children, let us not love with words or speech but with actions and in truth.',
  },
  { ref: 'Acts 20:35', text: 'It is more blessed to give than to receive.' },
  {
    ref: 'Matthew 6:21',
    text: 'For where your treasure is, there your heart will be also.',
  },
  {
    ref: 'Hebrews 13:16',
    text: 'And do not forget to do good and to share with others, for with such sacrifices God is pleased.',
  },
  {
    ref: '2 Corinthians 9:7',
    text: 'Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver.',
  },
  {
    ref: 'Matthew 6:3–4',
    text: 'But when you give to the needy, do not let your left hand know what your right hand is doing, so that your giving may be in secret. Then your Father, who sees what is done in secret, will reward you.',
  },
  {
    ref: 'Proverbs 3:9',
    text: 'Honor the Lord with your wealth and with the best part of everything you produce.',
  },
  {
    ref: 'Deuteronomy 8:18',
    text: 'But remember the Lord your God, for it is he who gives you the ability to produce wealth...',
  },
]

export function BibleVerse() {
  const verse = getWeeklyVerse()

  return (
    <div
      className={cx(
        'shadow-[0_0_50px_rgba(255,255,255,0.05)]',
        'grid gap-y-4 border border-border bg-base-0/50 p-4',
      )}
    >
      <div className="text-center text-balance text-fg-muted">
        “{verse.text}”
      </div>
      <div className="text-center text-sm text-fg-subtle">— {verse.ref}</div>
    </div>
  )
}

function getWeeklyVerse() {
  const week = getWeek(now(clientTz))
  const index = ((week % verses.length) + verses.length) % verses.length
  return verses[index] ?? verses[0]
}
