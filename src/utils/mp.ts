import { get } from '.';
import { JSDOM } from 'jsdom';

export async function getMpDetailUrls() {
  const mpListHtml = await get<string>(
    'https://beta.parliament.uk/houses/1AFu55Hs/members/current'
  );
  const {
    window: { document },
  } = new JSDOM(mpListHtml);

  const mpDetailUrls = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('.list--block h2 a')
  ).map(a => `https://beta.parliament.uk${a.href}`);

  return mpDetailUrls;
}

export async function getMpDetail(url: string) {
  const mpDetailHtml = await get<string>(url);
  const {
    window: { document },
  } = new JSDOM(mpDetailHtml);

  const mpDetailBlocksPairs = Array.from(
    document.querySelectorAll('.list--definition dt, .list--definition dd')
  );

  const mpDetail: any = mpDetailBlocksPairs.reduce((acc, el, i, arr) => {
    if (i % 2 === 1) {
      return acc;
    } else {
      const key = el.textContent.trim().toLocaleLowerCase();
      const value = arr[i + 1].textContent.trim().toLocaleLowerCase();
      (acc as any)[key] = value;
      return acc;
    }
  }, {});

  mpDetail.imageUrl = ((document.querySelector('picture img') || {
    src: '',
  }) as HTMLImageElement).src.split('?')[0];
  mpDetail.name = document.querySelector('h1 span').textContent;

  const [party, constituency] = Array.from(
    document.querySelectorAll('.context a')
  ).map(a => a.textContent);

  mpDetail.party = party;
  mpDetail.constituency = constituency;

  return mpDetail;
}
