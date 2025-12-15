interface CreditCardProps {
  size?: number
}

const DEFAULT_SIZE = 40

function AMEX({ size = DEFAULT_SIZE }: CreditCardProps) {
  return (
    <svg
      height={size * (80 / 120)}
      version="1.1"
      viewBox="0 0 120 80"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        fill="#fff"
        fillRule="evenodd"
        height="80"
        rx="4"
        width="80"
        x="40"
      />
      <path
        d="m120 76v-8.6763h-9.651l-4.969-5.4944-4.994 5.4944h-31.822v-25.607h-10.27l12.74-28.831h12.286l4.3857 9.877v-9.877h15.208l2.64 7.4429 2.658-7.4429h11.789v-8.8854c0-2.2091-1.7909-4-4-4h-112c-2.2091 4.4409e-16 -4 1.7909-4 4v72c4.4409e-16 2.2091 1.7909 4 4 4h112c2.2091 0 4-1.7909 4-4zm-8.026-11.882h8.026l-10.616-11.258 10.616-11.13h-7.898l-6.556 7.1645-6.4935-7.1645h-8.0275l10.554 11.194-10.554 11.194h7.8041l6.5889-7.2283 6.556 7.2283zm1.878-11.249 6.148 6.5406v-13.027l-6.148 6.4861zm-35.78 6.0675v-3.4864h12.633v-5.0534h-12.633v-3.4859h12.953l5e-4 -5.1815h-19.062v22.388h19.062l-5e-4 -5.1813h-12.953zm35.883-20.456h6.045v-22.388h-9.403l-5.022 13.944-4.989-13.944h-9.5631v22.388h6.0446v-15.672l5.7575 15.672h5.373l5.757-15.704v15.704zm-29.809 0h6.8765l-9.8824-22.388h-7.8682l-9.8833 22.388h6.7166l1.8554-4.4776h10.298l1.887 4.4776zm-3.9976-9.4992h-6.0773l3.0387-7.3242 3.0386 7.3242z"
        fill="#0690FF"
      />
    </svg>
  )
}

function DINERS({ size = DEFAULT_SIZE }: CreditCardProps) {
  return (
    <svg
      fill="none"
      height={size * (80 / 120)}
      viewBox="0 0 120 80"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="url(#paint0_linear_804_2)" height="80" rx="4" width="120" />
      <path
        clipRule="evenodd"
        d="M65.3997 64.8343C79.0213 64.8992 91.4542 53.7631 91.4542 40.2157C91.4542 25.4007 79.0213 15.1605 65.3997 15.1654H53.6768C39.8921 15.1605 28.5459 25.4038 28.5459 40.2157C28.5459 53.7661 39.8921 64.8993 53.6768 64.8343H65.3997Z"
        fill="#3477B9"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M53.6852 17.1522C41.0891 17.1561 30.8821 27.3313 30.8792 39.8896C30.8821 52.4456 41.089 62.6199 53.6852 62.6238C66.2843 62.6199 76.4934 52.4456 76.4952 39.8896C76.4933 27.3313 66.2843 17.1561 53.6852 17.1522ZM39.2291 39.8896C39.241 33.7529 43.0866 28.5199 48.5095 26.4404V53.3355C43.0866 51.2572 39.2409 46.0271 39.2291 39.8896ZM58.859 53.3415V26.4396C64.2838 28.514 68.1355 33.7499 68.1453 39.8896C68.1355 46.0311 64.2838 51.263 58.859 53.3415Z"
        fill="white"
        fillRule="evenodd"
      />
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="paint0_linear_804_2"
          x1="1.68141e-06"
          x2="120"
          y1="21"
          y2="54"
        >
          <stop stopColor="#3479C0" />
          <stop offset="1" stopColor="#133362" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function GENERIC({ size = DEFAULT_SIZE }: CreditCardProps) {
  return (
    <svg
      fill="none"
      height={size * (80 / 120)}
      viewBox="0 0 120 80"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="url(#paint0_linear_823_812)" height="80" rx="4" width="120" />
      <path
        d="M97.0264 65H83.0264"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        d="M75.853 65H61.853"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        d="M54.6797 65H40.6797"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        d="M33.5063 65H19.5063"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        d="M32.173 23.9866H18.8396C15.8941 23.9866 13.5063 26.3744 13.5063 29.3199V38.6533C13.5063 41.5988 15.8941 43.9866 18.8396 43.9866H32.173C35.1185 43.9866 37.5063 41.5988 37.5063 38.6533V29.3199C37.5063 26.3744 35.1185 23.9866 32.173 23.9866Z"
        fill="#EDEDED"
      />
      <path
        d="M22.5198 24.9999V42.9999M22.5198 36.9999H14.5198M36.5198 36.9999H28.5198M22.5198 30.9999H14.5198M36.4931 30.9999H28.2531V43.0533M18.8398 24.6533H32.1731C34.7504 24.6533 36.8398 26.7426 36.8398 29.3199V38.6533C36.8398 41.2306 34.7504 43.3199 32.1731 43.3199H18.8398C16.2624 43.3199 14.1731 41.2306 14.1731 38.6533V29.3199C14.1731 26.7426 16.2624 24.6533 18.8398 24.6533Z"
        stroke="black"
        strokeWidth="1.333"
      />
      <path
        d="M106.493 15H92.4932"
        stroke="#EDEDED"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="paint0_linear_823_812"
          x1="34.9333"
          x2="54.9376"
          y1="15.4667"
          y2="59.9923"
        >
          <stop stopColor="#C1C1C1" />
          <stop offset="1" stopColor="#9F9F9F" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function JCB({ size = DEFAULT_SIZE }: CreditCardProps) {
  return (
    <svg
      fill="none"
      height={size * (80 / 120)}
      viewBox="0 0 120 80"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="white" height="80" rx="4" width="120" />
      <path
        d="M100.9 58.8C100.9 65.8 95.1996 71.5 88.1996 71.5H19.0996V21.2C19.0996 14.2 24.7996 8.5 31.7996 8.5H100.9V58.8Z"
        fill="white"
      />
      <path
        d="M78.3994 45.9H83.6494C83.7994 45.9 84.1494 45.85 84.2994 45.85C85.2994 45.65 86.1494 44.75 86.1494 43.5C86.1494 42.3 85.2994 41.4 84.2994 41.15C84.1494 41.1 83.8494 41.1 83.6494 41.1H78.3994V45.9Z"
        fill="url(#paint0_linear_833_6149)"
      />
      <path
        d="M83.0494 12.75C78.0494 12.75 73.9494 16.8 73.9494 21.85V31.3H86.7994C87.0994 31.3 87.4494 31.3 87.6994 31.35C90.5994 31.5 92.7494 33 92.7494 35.6C92.7494 37.65 91.2994 39.4 88.5994 39.75V39.85C91.5494 40.05 93.7994 41.7 93.7994 44.25C93.7994 47 91.2994 48.8 87.9994 48.8H73.8994V67.3H87.2494C92.2494 67.3 96.3494 63.25 96.3494 58.2V12.75H83.0494Z"
        fill="url(#paint1_linear_833_6149)"
      />
      <path
        d="M85.4994 36.2C85.4994 35 84.6494 34.2 83.6494 34.05C83.5494 34.05 83.2994 34 83.1494 34H78.3994V38.4H83.1494C83.2994 38.4 83.5994 38.4 83.6494 38.35C84.6494 38.2 85.4994 37.4 85.4994 36.2Z"
        fill="url(#paint2_linear_833_6149)"
      />
      <path
        d="M57.8988 12.75C52.8988 12.75 48.7988 16.8 48.7988 21.85V33.75C51.0988 31.8 55.0988 30.55 61.5488 30.85C64.9988 31 68.6988 31.95 68.6988 31.95V35.8C66.8488 34.85 64.6488 34 61.7988 33.8C56.8988 33.45 53.9488 35.85 53.9488 40.05C53.9488 44.3 56.8988 46.7 61.7988 46.3C64.6488 46.1 66.8488 45.2 68.6988 44.3V48.15C68.6988 48.15 65.0488 49.1 61.5488 49.25C55.0988 49.55 51.0988 48.3 48.7988 46.35V67.35H62.1488C67.1488 67.35 71.2488 63.3 71.2488 58.25V12.75H57.8988Z"
        fill="url(#paint3_linear_833_6149)"
      />
      <path
        d="M32.7496 12.75C27.7496 12.75 23.6496 16.8 23.6496 21.85V44.3C26.1996 45.55 28.8496 46.35 31.4996 46.35C34.6496 46.35 36.3496 44.45 36.3496 41.85V31.25H44.1496V41.8C44.1496 45.9 41.5996 49.25 32.9496 49.25C27.6996 49.25 23.5996 48.1 23.5996 48.1V67.25H36.9496C41.9496 67.25 46.0496 63.2 46.0496 58.15V12.75H32.7496Z"
        fill="url(#paint4_linear_833_6149)"
      />
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="paint0_linear_833_6149"
          x1="60.9804"
          x2="126.075"
          y1="40.0821"
          y2="40.0821"
        >
          <stop stopColor="#007940" />
          <stop offset="0.2285" stopColor="#00873F" />
          <stop offset="0.7433" stopColor="#40A737" />
          <stop offset="1" stopColor="#5CB531" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="paint1_linear_833_6149"
          x1="73.9404"
          x2="96.4108"
          y1="40.0023"
          y2="40.0023"
        >
          <stop stopColor="#007940" />
          <stop offset="0.2285" stopColor="#00873F" />
          <stop offset="0.7433" stopColor="#40A737" />
          <stop offset="1" stopColor="#5CB531" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="paint2_linear_833_6149"
          x1="73.9396"
          x2="96.409"
          y1="36.1925"
          y2="36.1925"
        >
          <stop stopColor="#007940" />
          <stop offset="0.2285" stopColor="#00873F" />
          <stop offset="0.7433" stopColor="#40A737" />
          <stop offset="1" stopColor="#5CB531" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="paint3_linear_833_6149"
          x1="48.6689"
          x2="70.8287"
          y1="40.0023"
          y2="40.0023"
        >
          <stop stopColor="#6C2C2F" />
          <stop offset="0.1735" stopColor="#882730" />
          <stop offset="0.5731" stopColor="#BE1833" />
          <stop offset="0.8585" stopColor="#DC0436" />
          <stop offset="1" stopColor="#E60039" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="paint4_linear_833_6149"
          x1="23.6382"
          x2="46.4553"
          y1="40.0023"
          y2="40.0023"
        >
          <stop stopColor="#1F286F" />
          <stop offset="0.4751" stopColor="#004E94" />
          <stop offset="0.8261" stopColor="#0066B1" />
          <stop offset="1" stopColor="#006FBC" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function MASTERCARD({ size = DEFAULT_SIZE }: CreditCardProps) {
  return (
    <svg
      fill="none"
      height={size * (80 / 120)}
      viewBox="0 0 120 80"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="white" height="80" rx="4" width="120" />
      <path
        clipRule="evenodd"
        d="M97.5288 54.6562V53.7384H97.289L97.0137 54.3698L96.7378 53.7384H96.498V54.6562H96.6675V53.9637L96.9257 54.5609H97.1011L97.36 53.9624V54.6562H97.5288ZM96.0111 54.6562V53.8947H96.318V53.7397H95.5361V53.8947H95.843V54.6562H96.0111Z"
        fill="#F79E1B"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M49.6521 58.595H70.3479V21.4044H49.6521V58.595Z"
        fill="#FF5F00"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M98.2675 40.0003C98.2675 53.063 87.6791 63.652 74.6171 63.652C69.0996 63.652 64.0229 61.7624 60 58.5956C65.5011 54.2646 69.0339 47.5448 69.0339 40.0003C69.0339 32.4552 65.5011 25.7354 60 21.4044C64.0229 18.2376 69.0996 16.348 74.6171 16.348C87.6791 16.348 98.2675 26.937 98.2675 40.0003Z"
        fill="#F79E1B"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M50.966 40.0003C50.966 32.4552 54.4988 25.7354 59.9999 21.4044C55.977 18.2376 50.9003 16.348 45.3828 16.348C32.3208 16.348 21.7324 26.937 21.7324 40.0003C21.7324 53.063 32.3208 63.652 45.3828 63.652C50.9003 63.652 55.977 61.7624 59.9999 58.5956C54.4988 54.2646 50.966 47.5448 50.966 40.0003Z"
        fill="#EB001B"
        fillRule="evenodd"
      />
    </svg>
  )
}

function VISA({ size = DEFAULT_SIZE }: CreditCardProps) {
  return (
    <svg
      fill="none"
      height={size * (80 / 120)}
      viewBox="0 0 120 80"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="white" height="80" rx="4" width="120" />
      <path
        clipRule="evenodd"
        d="M86.6666 44.9375L90.3239 35.0625L92.3809 44.9375H86.6666ZM100.952 52.8375L95.8086 27.1625H88.7383C86.3525 27.1625 85.7723 29.0759 85.7723 29.0759L76.1904 52.8375H82.8868L84.2269 49.0244H92.3947L93.1479 52.8375H100.952Z"
        fill="#1434CB"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M77.1866 33.5711L78.0952 28.244C78.0952 28.244 75.2896 27.1625 72.3648 27.1625C69.2031 27.1625 61.6955 28.5638 61.6955 35.3738C61.6955 41.7825 70.5071 41.8621 70.5071 45.2266C70.5071 48.5912 62.6034 47.9901 59.9955 45.8676L59.0476 51.4362C59.0476 51.4362 61.8919 52.8375 66.2397 52.8375C70.5869 52.8375 77.1467 50.5544 77.1467 44.3455C77.1467 37.8964 68.2552 37.296 68.2552 34.4921C68.2552 31.6882 74.4602 32.0484 77.1866 33.5711Z"
        fill="#1434CB"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M54.6517 52.8375H47.6191L52.0144 27.1625H59.0477L54.6517 52.8375Z"
        fill="#1434CB"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M42.3113 27.1625L35.9217 44.8213L35.1663 41.0185L35.167 41.0199L32.9114 29.4749C32.9114 29.4749 32.6394 27.1625 29.7324 27.1625H19.1709L19.0476 27.5966C19.0476 27.5966 22.2782 28.2669 26.057 30.5326L31.8793 52.8375H38.8617L49.5238 27.1625H42.3113Z"
        fill="#1434CB"
        fillRule="evenodd"
      />
    </svg>
  )
}

export const CARD_COMPONENTS = {
  AMEX,
  DINERS,
  GENERIC,
  JCB,
  MASTERCARD,
  VISA,
} as const
