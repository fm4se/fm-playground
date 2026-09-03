import React from 'react';
import data from '@/../tools/common/Guides.json';
import '@/assets/style/Playground.css';

interface GuideItem {
    title: string;
    link: string;
}

interface GuidesData {
    [key: string]: GuideItem[];
}

interface GuidesProps {
    id: keyof GuidesData;
    editorTheme: string;
}

const guidesData: GuidesData = data;

const Guides: React.FC<GuidesProps> = ({ id, editorTheme }: GuidesProps) => {
    const guideData = guidesData[id];
    const isDarkTheme = editorTheme === 'vs-dark';

    if (!guideData) {
        return (
            <div>
                <h2>{id}</h2>
                <p>No data available for {id}</p>
            </div>
        );
    }

    return (
        <div>
            <h2
            style={{
                marginTop: '10px',
            }}
            >Guides</h2>
            <div className='row'>
                {guideData.map((item, index) => (
                    <div key={index} className='col-md-4' style={{ marginBottom: '12px' }}>
                        <div className='card guide-box'>
                            <div className='card-body'>
                                <h5 className='card-title'>
                                    {
                                        <a
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            href={item.link}
                                            className={isDarkTheme ? 'guide-link-dark' : 'guide-link-light'}
                                        >
                                            {item.title}{' '}
                                        </a>
                                    }
                                </h5>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Guides;
